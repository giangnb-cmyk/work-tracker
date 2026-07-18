-- 0037 — Vai trò 'owner' (trên admin). Owner CÓ mọi quyền admin (is_admin bao owner) +
-- ĐỘC QUYỀN cấp/đổi vai trò: phong admin, gỡ admin. Admin thường KHÔNG còn đổi được role
-- của bất kỳ ai — siết lại so với trước (0002 cho admin update hàng bất kỳ, tự phong admin
-- được). Phụ thuộc 0036 (enum value 'owner' đã commit).

-- Bootstrap owner TRƯỚC khi dựng guard: migration chạy bằng quyền chủ bảng, KHÔNG có phiên
-- auth → is_owner() sẽ false → nếu guard đã tồn tại nó sẽ chặn chính lệnh này. Update xong
-- mới gắn trigger. (giangnb là admin duy nhất lúc di trú nên không ai bị bỏ rơi.)
update public.profiles set role = 'owner' where lower(email) = 'giangnb@easygoing.vn';

-- is_admin: owner TÍNH LÀ admin ở MỌI cổng phân quyền → kế thừa nguyên bộ quyền admin có
-- sẵn mà không phải sờ tới từng policy. Giữ đúng khuôn 0001 (SECURITY DEFINER, chỉ soi
-- chính mình); create or replace giữ nguyên GRANT đã cấp ở 0002.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'owner')
  );
$$;

-- is_owner: chỉ owner. Cùng khuôn is_admin() — policy/trigger gọi được mà không đệ quy RLS,
-- chỉ tiết lộ trạng thái của CHÍNH user đang gọi.
create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'owner'
  );
$$;

revoke execute on function public.is_owner() from public, anon;
grant  execute on function public.is_owner() to authenticated;

-- ---------------------------------------------------------------------------
-- Chốt: chỉ owner đổi được cột role. profiles_update (0002) cho admin update hàng bất kỳ,
-- nhưng WITH CHECK không nhìn được giá trị CŨ nên không so role trước/sau → chặn ở BEFORE
-- trigger, cùng kiểu profiles_guard_perms (0034) / tasks_guard_points (0024).
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_role()
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
    -- Tự tạo hồ sơ lúc đăng nhập luôn role='member' (profiles_insert_self, 0001) → qua.
    -- Admin tạo member role='member' (createMember) → qua. Kèm admin/owner: chỉ owner.
    if new.role <> 'member' and not public.is_owner() then
      raise exception 'Chỉ owner được cấp vai trò admin/owner';
    end if;
  elsif new.role is distinct from old.role and not public.is_owner() then
    raise exception 'Chỉ owner được đổi vai trò';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_guard_role() from public, anon, authenticated;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_role();

-- has_perm (0034) so role = 'admin' RIÊNG, không đi qua is_admin() — nên phải tự thêm
-- 'owner' vào đây, nếu không owner (role='owner', perms rỗng) sẽ TRƯỢT has_perm và mất
-- các quyền lẻ như tạo feature (policy features_insert chỉ dựa has_perm). Giữ nguyên
-- GRANT của 0034.
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
      and (role in ('admin', 'owner') or p = any(perms))
  );
$$;
