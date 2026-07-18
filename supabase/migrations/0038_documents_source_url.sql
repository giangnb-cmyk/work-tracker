-- RAG: luu LINK MO NGUON cho tung chunk -> bot "gui tai lieu dung cho".
--
-- WHY: mot Google Sheet nhieu tab truoc gio nap chung 1 nguon ("Drive: <ten file>"),
-- chi phan biet tab bang cot `section` ("sheet 'Q1'"). Bot trich duoc noi dung dung tab
-- nhung KHONG co link mo dung tab do -> khong "gui tai lieu dung tab" duoc. Cot moi giu
-- link sau lung: voi Google Sheets la link toi DUNG TAB (`.../edit#gid=<gid>`), voi tai
-- lieu khac la webViewLink cua file, voi link ngoai (docs/links.txt) la chinh URL do.
--
-- Nullable: chunk cu / file cuc bo khong co link -> NULL, bot chi bo qua phan link.
-- Khong can policy moi: RLS bang documents (0014) da phu ca cot moi.

alter table public.documents
  add column if not exists source_url text;

comment on column public.documents.source_url is
  'Link mo nguon cua chunk. Google Sheets: link toi dung tab (#gid). File khac: webViewLink. NULL = khong co.';

-- match_documents phai TRA THEM source_url. Doi cot tra ve => phai DROP roi tao lai
-- (Postgres cam "change return type" qua create or replace). Giu nguyen chu ky tham so
-- va thuoc tinh bao mat (STABLE, search_path co dinh, khong SECURITY DEFINER) nhu 0014.
drop function if exists public.match_documents(vector, int, uuid);

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
    and (filter_project is null or d.project_id = filter_project)
  order by d.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- Chi cap EXECUTE cho vai tro can (giong 0014): thu hoi PUBLIC/anon.
revoke execute on function public.match_documents(vector, int, uuid) from public, anon;
grant  execute on function public.match_documents(vector, int, uuid) to authenticated, service_role;
