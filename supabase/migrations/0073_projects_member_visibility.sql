-- 0073 — Dự án chỉ hiện với người TRONG dự án. Trước giờ projects_select là using(true):
-- ai đăng nhập cũng thấy mọi dự án ở màn chọn. Giờ mặc định user KHÔNG thấy dự án nào
-- trừ khi admin thêm họ vào project_members (0052 — bảng + UI "Thành viên dự án" có sẵn);
-- admin/owner vẫn thấy tất cả.
--
-- LƯU Ý phạm vi: mới chặn ở cấp DỰ ÁN (đúng yêu cầu). Các bảng con (tasks/sprints/
-- features/bugs/…) select vẫn using(true) — UI không dẫn tới được vì không chọn được
-- project, nhưng gọi thẳng REST vẫn đọc được hàng con. Siết tiếp = việc riêng, đổi
-- từng bảng một sau khi cân nhắc (MyTasks, deep-link task, activity…).

-- is_project_member — SECURITY DEFINER cùng khuôn is_admin() (0001): policy của
-- project_members tự tra chính bảng mình sẽ đệ quy RLS, phải đi qua definer.
create or replace function public.is_project_member(pid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.project_members
    where project_id = pid and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_project_member(uuid) from public, anon;
grant  execute on function public.is_project_member(uuid) to authenticated;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using ( public.is_admin() or public.is_project_member(id) );

-- Roster dự án cũng thôi mở toang: thấy khi là admin / chính mình / người cùng dự án.
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (
    public.is_admin()
    or user_id = (select auth.uid())
    or public.is_project_member(project_id)
  );
