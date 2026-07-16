-- Member DM test queue: admin picks a member on the web (Cấu hình tab) and the
-- (service-role) bot DMs that member their weekly summary as a TEST message.
-- Same request-queue shape as bug_sync_requests (0011): web inserts, bot drains.

create table public.member_dm_requests (
  id             uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  requested_by   uuid references public.profiles (id) on delete set null,
  status         text not null default 'pending',   -- pending | done | error
  result         text not null default '',
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);
alter table public.member_dm_requests enable row level security;
create index member_dm_requests_pending_idx on public.member_dm_requests (status, created_at);

-- Admin-only on BOTH sides (stricter than bug_sync_requests, which lets anyone read):
-- this is an admin test tool, members have no reason to see who tested what.
-- Draining (update) is done by the bot with the service-role key, which bypasses RLS.
create policy member_dm_requests_select on public.member_dm_requests
  for select to authenticated using ( public.is_admin() );
create policy member_dm_requests_insert on public.member_dm_requests
  for insert to authenticated with check ( public.is_admin() );

alter publication supabase_realtime add table public.member_dm_requests;
