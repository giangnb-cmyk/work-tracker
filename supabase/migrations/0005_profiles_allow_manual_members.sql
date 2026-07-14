-- Discord-only teammates (admin-managed, never sign in) need a profile row without a
-- matching auth.users id. Drop the auth FK and default id so auth-linked profiles
-- (id = auth uid, set by the signup trigger) and manual ones coexist.
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
