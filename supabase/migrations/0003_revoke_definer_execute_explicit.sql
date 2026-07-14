-- Supabase grants EXECUTE directly to anon/authenticated (not just PUBLIC), so revoke
-- explicitly. Trigger + event-trigger functions run as their definer regardless.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
-- is_admin() stays callable by `authenticated` (RLS policies invoke it); drop anon only.
revoke execute on function public.is_admin() from anon;

-- A notification is always for someone OTHER than its creator.
drop policy notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check ( recipient_id is distinct from (select auth.uid()) );
