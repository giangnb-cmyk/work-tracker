-- Bug tracker (project-scoped). A bug has a kanban `status`, a per-project running
-- `number`, and freeform `label_ids` drawn from a per-project label palette.

create type bug_status as enum ('open', 'fixing', 'pending', 'deployed', 'done');

-- ---------------------------------------------------------------------------
-- bug_labels — the per-project tag palette (Bug / High / Fixing / 1.0.x / …)
-- ---------------------------------------------------------------------------
create table public.bug_labels (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  color       text not null default '#6366f1',
  icon        text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);
alter table public.bug_labels enable row level security;
create index bug_labels_project_idx on public.bug_labels (project_id, name);
create policy bug_labels_select on public.bug_labels for select to authenticated using (true);
create policy bug_labels_write  on public.bug_labels for all to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- ---------------------------------------------------------------------------
-- bugs
-- ---------------------------------------------------------------------------
create table public.bugs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  number        bigint not null default 0,       -- per-project running id (#530)
  title         text not null check (char_length(title) between 1 and 200),
  description   text not null default '',
  status        bug_status not null default 'open',
  label_ids     uuid[] not null default '{}',
  reporter_id   uuid references public.profiles (id) on delete set null,
  reporter_name text not null default '',
  assignee_id   uuid references public.profiles (id) on delete set null,
  assignee_name text not null default '',
  "order"       double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.bugs enable row level security;
create index bugs_project_status_idx on public.bugs (project_id, status, "order");

create policy bugs_select on public.bugs for select to authenticated using (true);
create policy bugs_insert on public.bugs for insert to authenticated
  with check ( char_length(title) > 0 );
create policy bugs_update on public.bugs for update to authenticated
  using (
    public.is_admin()
    or reporter_id = (select auth.uid())
    or assignee_id = (select auth.uid())
  )
  with check ( true );
create policy bugs_delete on public.bugs for delete to authenticated
  using ( public.is_admin() or reporter_id = (select auth.uid()) );

-- Assign the next per-project number on insert (server-side, race-safe within a txn).
create or replace function public.assign_bug_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number), 0) + 1 into new.number
    from public.bugs where project_id = new.project_id;
  end if;
  return new;
end;
$$;
create trigger bugs_assign_number before insert on public.bugs
  for each row execute function public.assign_bug_number();
-- It runs only as a trigger; no client should call it via RPC. Revoke PUBLIC too
-- (roles inherit EXECUTE from PUBLIC) — triggers still fire without EXECUTE grants.
revoke execute on function public.assign_bug_number() from public, anon, authenticated;

-- Reuse the shared updated_at toucher (defined in 0001_init).
create trigger bugs_touch_updated_at before update on public.bugs
  for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.bugs;
alter publication supabase_realtime add table public.bug_labels;
