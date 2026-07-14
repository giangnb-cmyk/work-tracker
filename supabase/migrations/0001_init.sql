-- Bot Work Tracker — initial Supabase schema.
-- Mirrors DATA_MODEL.md + firestore.rules. Columns are snake_case (Postgres convention);
-- the web/bot map to camelCase in their data layer.
--
-- Auth: Supabase Auth (Google). Each signed-in user has a row in public.profiles
-- keyed by auth.users.id. Authorization role ('admin'|'member') lives in profiles
-- (NEVER in user_metadata, which is user-editable).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type task_status   as enum ('todo', 'in_progress', 'review', 'done');
create type task_priority as enum ('low', 'medium', 'high', 'urgent');
create type sprint_status as enum ('planning', 'active', 'completed');
create type user_role     as enum ('admin', 'member');
create type job_role      as enum ('developer', '2d_artist', 'game_designer', 'sound_designer', 'ui_artist', 'animator');
create type task_source   as enum ('web', 'discord');

-- ---------------------------------------------------------------------------
-- Admin check — SECURITY DEFINER so profile policies can reference it without
-- recursing on profiles' own RLS. Only reveals the CURRENT user's admin status.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles (was users/{uid})
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null default '',
  display_name   text not null default '',
  photo_url      text not null default '',
  role           user_role not null default 'member',
  job_role       job_role,
  discord_id     text,
  notion_user_id text,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz
);
alter table public.profiles enable row level security;

-- Anyone signed in reads the roster; you manage your own doc but can't self-promote.
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check ( id = (select auth.uid()) and role = 'member' );
create policy profiles_insert_admin on public.profiles
  for insert to authenticated with check ( public.is_admin() );
create policy profiles_update_self on public.profiles
  for update to authenticated
  using ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) and role = 'member' );
create policy profiles_update_admin on public.profiles
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy profiles_delete_admin on public.profiles
  for delete to authenticated using ( public.is_admin() );

-- Auto-create a profile row on sign-up from the Google identity.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, photo_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- sprints
-- ---------------------------------------------------------------------------
create table public.sprints (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  goal       text not null default '',
  status     sprint_status not null default 'planning',
  start_date timestamptz,
  end_date   timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);
alter table public.sprints enable row level security;
create policy sprints_select on public.sprints for select to authenticated using (true);
create policy sprints_write  on public.sprints for all to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  icon              text not null default '📁',
  color             text not null default '#6366f1',
  description       text not null default '',
  notion_project_id text,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null
);
alter table public.projects enable row level security;
create policy projects_select on public.projects for select to authenticated using (true);
create policy projects_write  on public.projects for all to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 1 and 140),
  description     text not null default '',
  sprint_id       uuid references public.sprints (id) on delete set null,
  project_id      uuid references public.projects (id) on delete set null,
  status          task_status not null default 'todo',
  priority        task_priority not null default 'medium',
  assignee_id     uuid references public.profiles (id) on delete set null,
  assignee_name   text not null default '',
  reporter_id     uuid references public.profiles (id) on delete set null,
  points          int not null default 0,
  tags            text[] not null default '{}',
  due_start       timestamptz,
  due_date        timestamptz,
  "order"         double precision not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  source          task_source not null default 'web',
  notion_page_id  text,
  notion_url      text,
  attachments     jsonb not null default '[]',
  subtasks        jsonb not null default '[]',
  watcher_ids     uuid[] not null default '{}',
  watcher_names   text[] not null default '{}'
);
alter table public.tasks enable row level security;
create index tasks_sprint_order_idx on public.tasks (sprint_id, "order");
create index tasks_project_idx      on public.tasks (project_id);
create index tasks_assignee_idx     on public.tasks (assignee_id, status);

-- Everyone signed in reads; anyone signed in creates; admin/reporter/assignee edit.
create policy tasks_select on public.tasks for select to authenticated using (true);
create policy tasks_insert on public.tasks for insert to authenticated
  with check ( char_length(title) > 0 );
create policy tasks_update on public.tasks for update to authenticated
  using (
    public.is_admin()
    or reporter_id = (select auth.uid())
    or assignee_id = (select auth.uid())
  )
  with check ( true );
create policy tasks_delete on public.tasks for delete to authenticated
  using ( public.is_admin() or reporter_id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  task_id      uuid,
  task_title   text not null default '',
  type         text not null default 'task_done',
  body         text not null default '',
  actor_name   text not null default '',
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- Only the recipient reads/updates/deletes; any signed-in user may create one.
create policy notifications_own on public.notifications
  for select to authenticated using ( recipient_id = (select auth.uid()) );
create policy notifications_update_own on public.notifications
  for update to authenticated
  using ( recipient_id = (select auth.uid()) )
  with check ( recipient_id = (select auth.uid()) );
create policy notifications_delete_own on public.notifications
  for delete to authenticated using ( recipient_id = (select auth.uid()) );
create policy notifications_insert on public.notifications
  for insert to authenticated with check ( true );

-- ---------------------------------------------------------------------------
-- app_config (was config/access — the sign-in allowlist)
-- ---------------------------------------------------------------------------
create table public.app_config (
  id      text primary key,           -- e.g. 'access'
  emails  text[] not null default '{}',
  domains text[] not null default '{}'
);
alter table public.app_config enable row level security;
create policy app_config_select on public.app_config for select to authenticated using (true);
create policy app_config_write  on public.app_config for all to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- Keep updated_at fresh on tasks.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();
