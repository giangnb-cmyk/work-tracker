-- RAG document store. Chunks of ingested docs (spec, meeting notes, PDF...) with a
-- bge-m3 dense embedding (1024-dim) for semantic search. Written by the bot's
-- doc_ingest skill (service_role); searched via the match_documents RPC.

-- pgvector: cai vao schema 'extensions' (chuan Supabase) -> tranh advisor "extension in public".
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- documents — one row per chunk. project_id nullable = tài liệu chung (không gắn project).
-- ---------------------------------------------------------------------------
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects (id) on delete cascade,
  source       text not null check (char_length(source) between 1 and 300),  -- tên file / nguồn
  section      text not null default '',                                       -- 'trang 3' / "sheet 'Q1'"
  chunk_index  int  not null default 0,
  content      text not null check (char_length(content) > 0),
  embedding    vector(1024),                                                   -- bge-m3 dense
  created_at   timestamptz not null default now()
);
alter table public.documents enable row level security;

-- Loc theo project/nguon (xoa & liet ke nguon), va HNSW cho tim ngu nghia (cosine).
create index documents_project_source_idx on public.documents (project_id, source);
create index documents_embedding_idx on public.documents
  using hnsw (embedding vector_cosine_ops);

-- Đọc: mọi thành viên đăng nhập. Ghi: chỉ admin (bot dùng service_role -> bỏ qua RLS).
create policy documents_select on public.documents for select to authenticated using (true);
create policy documents_write  on public.documents for all to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- ---------------------------------------------------------------------------
-- match_documents — top-k chunk gần nhất theo cosine. filter_project = null -> mọi tài liệu.
-- STABLE, không SECURITY DEFINER (chạy theo quyền người gọi -> RLS vẫn áp cho authenticated).
-- search_path cố định = extensions, public: toán tử pgvector `<=>` sống ở 'extensions'
-- (không phân giải được nếu search_path rỗng); cố định => vẫn thỏa advisor.
-- ---------------------------------------------------------------------------
create or replace function public.match_documents(
  query_embedding vector(1024),
  match_count int default 5,
  filter_project uuid default null
)
returns table (
  id uuid,
  project_id uuid,
  source text,
  section text,
  chunk_index int,
  content text,
  similarity double precision
)
language sql
stable
set search_path = extensions, public
as $$
  select
    d.id,
    d.project_id,
    d.source,
    d.section,
    d.chunk_index,
    d.content,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where d.embedding is not null
    and (filter_project is null or d.project_id = filter_project)
  order by d.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- Chỉ cấp EXECUTE cho vai trò cần (giống 0003): thu hoi PUBLIC/anon.
revoke execute on function public.match_documents(vector, int, uuid) from public, anon;
grant  execute on function public.match_documents(vector, int, uuid) to authenticated, service_role;
