-- 0024 — Member sửa task MÌNH TẠO (người nhận, feature, hạn chót, subtask, mô tả,
-- tài liệu) nhưng KHÔNG được sửa story point.
--
-- RLS tasks_update (0002) đã cho reporter/assignee update cả row — web chỉ mở thêm
-- field ở UI nên KHÔNG cần policy mới. Riêng story point phải chốt ở DB: WITH CHECK
-- của RLS không nhìn được giá trị CŨ, nên dùng BEFORE UPDATE trigger so OLD với NEW.

create or replace function public.tasks_guard_points()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Bot dùng service_role (bypass RLS) — bỏ qua, quyền của bot gate ở skills/permissions.py.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if new.points is distinct from old.points and not public.is_admin() then
    raise exception 'Chỉ admin được sửa story point';
  end if;
  return new;
end;
$$;

-- Trigger vẫn chạy dù không có execute — revoke chỉ là vệ sinh, chặn gọi tay.
revoke execute on function public.tasks_guard_points() from public, anon, authenticated;

drop trigger if exists tasks_guard_points on public.tasks;
create trigger tasks_guard_points
  before update on public.tasks
  for each row execute function public.tasks_guard_points();
