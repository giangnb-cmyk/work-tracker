-- Public bucket for task image attachments. Public read (served via public URL);
-- authenticated users may upload/replace/delete.
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true)
  on conflict (id) do nothing;

create policy "attachments_read" on storage.objects
  for select to public using ( bucket_id = 'attachments' );
create policy "attachments_insert" on storage.objects
  for insert to authenticated with check ( bucket_id = 'attachments' );
create policy "attachments_update" on storage.objects
  for update to authenticated using ( bucket_id = 'attachments' ) with check ( bucket_id = 'attachments' );
create policy "attachments_delete" on storage.objects
  for delete to authenticated using ( bucket_id = 'attachments' );
