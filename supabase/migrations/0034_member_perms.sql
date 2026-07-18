-- 0034 — Quyền lẻ cho member. Admin cấp thêm từng quyền phụ ngoài vai trò
-- admin/member: hiện có 'task.delete' (xoá task bất kỳ) và 'feature.create'
-- (tạo feature mới). Lưu text[] thay vì cột boolean: thêm quyền mới sau này
-- chỉ cần sửa MEMBER_PERMS trong web/src/types.ts, không cần DDL.

alter table public.profiles
  add column perms text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- has_perm — admin nghiễm nhiên có mọi quyền; member phải được cấp lẻ.
-- SECURITY DEFINER cùng lý do is_admin() (0001): policy trên profiles gọi nó
-- mà không đệ quy RLS; chỉ tiết lộ quyền của CHÍNH user đang gọi.
-- ---------------------------------------------------------------------------
create or replace function public.has_perm(p text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and (role = 'admin' or p = any(perms))
  );
$$;

revoke execute on function public.has_perm(text) from public, anon;
grant  execute on function public.has_perm(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Chặn member tự cấp quyền cho mình. profiles_update (0002) cho user update
-- hàng của chính mình, nhưng WITH CHECK không nhìn được giá trị CŨ nên không
-- so perms trước/sau được — chốt bằng BEFORE trigger, cùng kiểu
-- tasks_guard_points (0024).
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_perms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Bot dùng service_role (bypass RLS) — quyền của bot gate ở skills/permissions.py.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- profiles_insert_self (0001) cho user tự tạo hồ sơ — không được kèm perms.
    if coalesce(new.perms, '{}') <> '{}' and not public.is_admin() then
      raise exception 'Chỉ admin được cấp quyền';
    end if;
  elsif new.perms is distinct from old.perms and not public.is_admin() then
    raise exception 'Chỉ admin được cấp quyền';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_guard_perms() from public, anon, authenticated;

drop trigger if exists profiles_guard_perms on public.profiles;
create trigger profiles_guard_perms
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_perms();

-- ---------------------------------------------------------------------------
-- Xoá task: như cũ (admin / reporter) + member có 'task.delete'.
-- has_perm đã bao admin nên bỏ vế is_admin() riêng.
-- ---------------------------------------------------------------------------
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using ( public.has_perm('task.delete') or reporter_id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- Tạo feature: tách features_write (0009, FOR ALL) để cấp lẻ được insert;
-- update/delete giữ admin-only — quyền là TẠO, không phải sửa/xoá.
-- ---------------------------------------------------------------------------
drop policy if exists features_write on public.features;
create policy features_insert on public.features for insert to authenticated
  with check ( public.has_perm('feature.create') );
create policy features_update on public.features for update to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );
create policy features_delete on public.features for delete to authenticated
  using ( public.is_admin() );
