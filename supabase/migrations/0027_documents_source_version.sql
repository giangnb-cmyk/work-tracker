-- RAG: nap tang dan (incremental) cho tai lieu Google Drive.
--
-- WHY: embedding bge-m3 chay LOCAL ~3s/chunk. Nap lai toan bo ruot tai lieu Drive
-- (~2.4k chunk) mat ~2 gio -> lich daily 9h khong the chay lai tu dau moi ngay
-- (timeout 900s se giet giua chung, kho con lai nua voi nua moi).
--
-- Luu 'phien ban' cua nguon (voi Drive = modifiedTime RFC3339). Lan sync sau chi nap
-- lai file co modifiedTime KHAC ban trong kho -> ngay thuong gan nhu khong ton gi.
--
-- Nullable: cac nguon khac (file trong docs/, link, danh muc Drive) khong dung cot nay.
-- Khong can policy moi: RLS cua bang documents (0014) da phu ca cot moi.

alter table public.documents
  add column if not exists source_version text;

comment on column public.documents.source_version is
  'Phien ban cua nguon de sync tang dan (Drive: modifiedTime RFC3339). NULL = khong theo doi.';

-- Tra loi "nguon nay dang o phien ban nao" ma khong phai quet het moi chunk.
create index if not exists documents_source_version_idx
  on public.documents (source, source_version);
