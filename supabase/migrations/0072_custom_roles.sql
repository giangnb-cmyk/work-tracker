-- 0072 — Role tuỳ chỉnh. Trước đây "vị trí" là enum job_role cứng trong DB + JOB_ROLES
-- trong types.ts; giờ admin tạo role động (tên + icon + BỘ QUYỀN đi kèm), user mới
-- đăng nhập chọn role từ list này (RolePicker). Quyền của một người = quyền lẻ
-- (profiles.perms, 0034) ∪ quyền theo role (roles.perms) — gộp trong has_perm().
--
-- job_role (enum) KHÔNG bỏ: ~16 chỗ hiển thị icon đang tra Record<JobRole,…>. Mỗi role
-- có thể trỏ `legacy_job_role` về enum tương ứng; trigger đồng bộ profiles.job_role khi
-- đổi role_id nên các màn cũ vẫn hiện đúng icon mà không phải sửa hàng loạt.

create table public.roles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  icon            text not null default '👤',
  -- Cùng không gian giá trị với profiles.perms ('task.delete', 'feature.create', …).
  perms           text[] not null default '{}',
  sort            integer not null default 0,
  -- Enum job_role tương ứng (role chuẩn seed từ JOB_ROLES); role tuỳ chỉnh thì NULL.
  legacy_job_role public.job_role,
  created_at      timestamptz not null default now()
);
alter table public.roles enable row level security;
create unique index roles_name_unique_idx on public.roles (lower(name));

-- Đọc mở cho người đã đăng nhập (RolePicker cần list trước khi user có gì khác);
-- ghi chỉ admin — role mang QUYỀN nên không thể để member tự chế.
create policy roles_select on public.roles
  for select to authenticated using (true);
create policy roles_insert on public.roles
  for insert to authenticated with check ( public.is_admin() );
create policy roles_update on public.roles
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy roles_delete on public.roles
  for delete to authenticated using ( public.is_admin() );

-- Realtime cho RoleManager/RolePicker; REPLICA IDENTITY FULL cùng lý do 0021.
alter table public.roles replica identity full;
alter publication supabase_realtime add table public.roles;

-- Seed đúng bộ JOB_ROLES của web (types.ts) — list chọn không trống ngay ngày đầu,
-- member cũ backfill được. Quyền để trống: admin tự cấp sau ở màn Cấu hình.
insert into public.roles (name, icon, sort, legacy_job_role) values
  ('Developer',      '💻', 1, 'developer'),
  ('2D Artist',      '🎨', 2, '2d_artist'),
  ('Game Designer',  '🎮', 3, 'game_designer'),
  ('Sound Designer', '🎵', 4, 'sound_designer'),
  ('UI Artist',      '🖌️', 5, 'ui_artist'),
  ('Animator',       '🎞️', 6, 'animator'),
  ('VFX Artist',     '✨', 7, 'vfx_artist'),
  ('QA',             '🐞', 8, 'qa');

alter table public.profiles
  add column role_id uuid references public.roles (id) on delete set null;

-- Backfill TRƯỚC khi gắn guard trigger (khuôn 0037: migration chạy không có phiên auth,
-- is_admin() = false — gắn guard trước là tự chặn chính mình).
update public.profiles p
set role_id = r.id
from public.roles r
where p.role_id is null
  and p.job_role is not null
  and r.legacy_job_role = p.job_role;

-- ---------------------------------------------------------------------------
-- has_perm v3 — quyền lẻ ∪ quyền theo role; admin/owner nghiễm nhiên đủ.
-- Giữ nguyên khuôn + GRANT của 0034/0037 (SECURITY DEFINER, chỉ soi chính mình).
-- ---------------------------------------------------------------------------
create or replace function public.has_perm(p text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = (select auth.uid())
      and (
        pr.role in ('admin', 'owner')
        or p = any(pr.perms)
        or exists (
          select 1 from public.roles r
          where r.id = pr.role_id and p = any(r.perms)
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Guard + sync role_id. Member chỉ TỰ chọn được khi đang trống (lần đầu đăng nhập
-- — đúng flow RolePicker); đổi về sau là việc của admin. Đổi role_id thì đồng bộ
-- luôn job_role theo legacy_job_role (role tuỳ chỉnh không map thì GIỮ job_role cũ
-- — chuyên môn không đổi chỉ vì đổi chức danh).
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_role_id()
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
    -- handle_new_user/tự tạo hồ sơ: role_id null → qua. Kèm role_id: chỉ admin.
    if new.role_id is not null and not public.is_admin() then
      raise exception 'Chỉ admin được gán role khi tạo hồ sơ';
    end if;
  elsif new.role_id is distinct from old.role_id then
    if not public.is_admin()
       and not (old.role_id is null
                and new.role_id is not null
                and new.id = (select auth.uid())) then
      raise exception 'Chỉ admin được đổi role (member chỉ tự chọn lần đầu)';
    end if;
  end if;

  if new.role_id is not null
     and (tg_op = 'INSERT' or new.role_id is distinct from old.role_id) then
    new.job_role := coalesce(
      (select r.legacy_job_role from public.roles r where r.id = new.role_id),
      new.job_role
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_guard_role_id() from public, anon, authenticated;

drop trigger if exists profiles_guard_role_id on public.profiles;
create trigger profiles_guard_role_id
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_role_id();
