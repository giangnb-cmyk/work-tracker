-- Hardening pass after advisors: fix search_path, collapse duplicate permissive
-- policies, tighten tasks_update WITH CHECK, index foreign keys.

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to authenticated;

drop policy sprints_write on public.sprints;
create policy sprints_insert on public.sprints for insert to authenticated with check ( public.is_admin() );
create policy sprints_update on public.sprints for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy sprints_delete on public.sprints for delete to authenticated using ( public.is_admin() );

drop policy projects_write on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check ( public.is_admin() );
create policy projects_update on public.projects for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy projects_delete on public.projects for delete to authenticated using ( public.is_admin() );

drop policy app_config_write on public.app_config;
create policy app_config_insert on public.app_config for insert to authenticated with check ( public.is_admin() );
create policy app_config_update on public.app_config for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy app_config_delete on public.app_config for delete to authenticated using ( public.is_admin() );

drop policy profiles_insert_self on public.profiles;
drop policy profiles_insert_admin on public.profiles;
drop policy profiles_update_self on public.profiles;
drop policy profiles_update_admin on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check ( public.is_admin() or (id = (select auth.uid()) and role = 'member') );
create policy profiles_update on public.profiles for update to authenticated
  using ( public.is_admin() or id = (select auth.uid()) )
  with check ( public.is_admin() or (id = (select auth.uid()) and role = 'member') );

drop policy tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using ( public.is_admin() or reporter_id = (select auth.uid()) or assignee_id = (select auth.uid()) )
  with check ( public.is_admin() or reporter_id = (select auth.uid()) or assignee_id = (select auth.uid()) );

create index tasks_reporter_idx      on public.tasks (reporter_id);
create index sprints_created_by_idx  on public.sprints (created_by);
create index projects_created_by_idx on public.projects (created_by);
