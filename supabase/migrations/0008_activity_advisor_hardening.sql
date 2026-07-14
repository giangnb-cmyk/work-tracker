-- Trigger / internal SECURITY DEFINER functions are never called via RPC.
-- Revoke from PUBLIC (anon/authenticated inherit it) so they aren't exposed as RPC.
revoke execute on function public.actor_display_name() from public;
revoke execute on function public.log_task_created() from public;
revoke execute on function public.log_task_status() from public;

-- Public bucket: object URLs work without a SELECT policy; drop the broad one so
-- clients can't list every file. Uploads/deletes (insert/update/delete policies) stay.
drop policy if exists attachments_read on storage.objects;
