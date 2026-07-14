-- Task activity feed: created / status_change (auto via triggers) + comments (client insert).
create table public.activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  actor_name text not null default '',
  type       text not null,                 -- created | status_change | comment | updated
  body       text not null default '',
  created_at timestamptz not null default now()
);
alter table public.activity enable row level security;
create index activity_task_idx on public.activity (task_id, created_at desc);
create index activity_actor_idx on public.activity (actor_id);

create policy activity_select on public.activity for select to authenticated using (true);
create policy activity_insert on public.activity for insert to authenticated
  with check ( type = 'comment' and actor_id = (select auth.uid()) );

create or replace function public.actor_display_name()
returns text language sql security definer set search_path = '' stable as $$
  select coalesce((select display_name from public.profiles where id = (select auth.uid())), '');
$$;
revoke execute on function public.actor_display_name() from anon, authenticated;

create or replace function public.log_task_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity (task_id, actor_id, actor_name, type, body)
  values (new.id, (select auth.uid()), public.actor_display_name(), 'created', '');
  return new;
end;
$$;
create trigger tasks_log_created after insert on public.tasks
  for each row execute function public.log_task_created();

create or replace function public.log_task_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.activity (task_id, actor_id, actor_name, type, body)
    values (new.id, (select auth.uid()), public.actor_display_name(), 'status_change', new.status::text);
  end if;
  return new;
end;
$$;
create trigger tasks_log_status after update on public.tasks
  for each row execute function public.log_task_status();

alter publication supabase_realtime add table public.activity;
