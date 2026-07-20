-- match_documents: khi tim theo project van kem CA tai lieu chung (project_id IS NULL).
--
-- WHY: toan bo tai lieu RAG hien nap dang "chung" (project_id = NULL). Ham cu loc
-- `filter_project is null OR d.project_id = filter_project`, nen neu goi kem --project
-- thi `NULL = <uuid>` -> NULL (false) => tra ve 0 ket qua, bot bao nham "kho khong co gi".
-- Sua: tai lieu chung dung chung cho MOI project, nen khi loc theo 1 project van gop
-- them tai lieu chung. filter_project = NULL van tra ve tat ca nhu cu.
--
-- Giu NGUYEN chu ky + cot tra ve cua 0038 (co source_url) -> create or replace duoc,
-- khong phai drop. Giu thuoc tinh bao mat: STABLE, khong SECURITY DEFINER, search_path
-- co dinh (extensions, public) cho toan tu pgvector `<=>`, cap execute nhu 0014/0038.

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
      filter_project is null           -- khong loc -> moi tai lieu
      or d.project_id = filter_project -- tai lieu cua dung project
      or d.project_id is null           -- + tai lieu chung (dung cho moi project)
    )
  order by d.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

revoke execute on function public.match_documents(vector, int, uuid) from public, anon;
grant  execute on function public.match_documents(vector, int, uuid) to authenticated, service_role;
