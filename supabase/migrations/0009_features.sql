-- Features: a unit of product work inside a project. A task may belong to one
-- feature (optional). Mirrors the projects table's RLS (read: all signed-in;
-- write: admin only).
create table public.features (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  icon        text not null default '🧩',
  color       text not null default '#6366f1',
  description text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);
alter table public.features enable row level security;
create index features_project_idx on public.features (project_id, name);

create policy features_select on public.features for select to authenticated using (true);
create policy features_write  on public.features for all to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- A task links to at most one feature; deleting the feature detaches its tasks.
alter table public.tasks
  add column feature_id uuid references public.features (id) on delete set null;
create index tasks_feature_idx on public.tasks (feature_id);

-- Live updates for the Features tab.
alter publication supabase_realtime add table public.features;
