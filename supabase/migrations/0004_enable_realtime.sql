-- Stream row changes to authenticated clients (RLS still applies) for live updates.
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.sprints;
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.notifications;
