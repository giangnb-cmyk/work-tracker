-- 0050 — Giới hạn RAG theo folder Drive cho MEMBER.
--
-- Yêu cầu: member hỏi tài liệu thì CHỈ được thấy tài liệu trong 1 folder Drive cố định
-- (tính cả folder con); admin/owner thấy tất cả. Bảng documents chưa biết mỗi chunk thuộc
-- folder nào -> thêm cột drive_folder_ids = TẬP id folder tổ tiên của file (folder cha +
-- mọi cấp trên tới gốc). drive_ingest.py ghi cột này lúc nạp (và có mode --backfill-folders
-- để gán cho tài liệu đã nạp mà không embedding lại). File ngoài Drive (docs/, link) = {}.
--
-- match_documents thêm tham số filter_folder: khác NULL thì chỉ trả chunk có folder đó
-- trong tổ tiên (member); NULL = không lọc (admin, như cũ).

alter table public.documents
  add column if not exists drive_folder_ids text[] not null default '{}';

-- Lọc folder nhanh khi match cho member.
create index if not exists documents_folder_ids_idx on public.documents using gin (drive_folder_ids);

-- Đổi chữ ký (thêm filter_folder) => phải DROP rồi tạo lại (như 0038).
drop function if exists public.match_documents(vector, int, uuid);

create or replace function public.match_documents(
  query_embedding vector(1024),
  match_count int default 5,
  filter_project uuid default null,
  filter_folder text default null
)
returns table (
  id uuid,
  project_id uuid,
  source text,
  section text,
  chunk_index int,
  content text,
  source_url text,
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
    d.source_url,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where d.embedding is not null
    and (
      filter_project is null
      or d.project_id = filter_project
      or d.project_id is null
    )
    -- filter_folder != NULL (member) -> chunk phải thuộc folder đó hoặc folder con của nó.
    and (filter_folder is null or filter_folder = any(d.drive_folder_ids))
  order by d.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

revoke execute on function public.match_documents(vector, int, uuid, text) from public, anon;
grant  execute on function public.match_documents(vector, int, uuid, text) to authenticated, service_role;
