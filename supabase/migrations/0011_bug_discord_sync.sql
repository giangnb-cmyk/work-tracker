-- Discord forum → bugs sync support.
-- 1) Link a bug to its source Discord forum thread (upsert key, unique when set).
-- 2) A request queue the web app writes to and the (service-role) bot drains,
--    so a "Sync now" button can trigger an on-demand pull.

alter table public.bugs add column discord_thread_id text;
create unique index bugs_discord_thread_idx on public.bugs (discord_thread_id)
  where discord_thread_id is not null;

create table public.bug_sync_requests (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  status       text not null default 'pending',   -- pending | done | error
  result       text not null default '',
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.bug_sync_requests enable row level security;
create index bug_sync_requests_pending_idx on public.bug_sync_requests (status, created_at);

-- Admins queue a sync; everyone signed in may read status. Draining (update) is
-- done by the bot with the service-role key, which bypasses RLS.
create policy bug_sync_select on public.bug_sync_requests for select to authenticated using (true);
create policy bug_sync_insert on public.bug_sync_requests for insert to authenticated
  with check ( public.is_admin() );

alter publication supabase_realtime add table public.bug_sync_requests;
