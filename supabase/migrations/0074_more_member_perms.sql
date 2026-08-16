-- 0074 — Mở rộng bộ quyền lẻ (0034) cho các cổng đang khoá cứng is_admin(). Mỗi quyền
-- dưới đây cấp được theo từng member (profiles.perms) HOẶC theo role (roles.perms, 0072)
-- — has_perm() đã gộp cả hai và bao admin/owner. Web thêm gate tương ứng trong
-- MEMBER_PERMS (types.ts) + các component; đây là tầng chặn thật.
--
-- Quyền mới: task.edit_any, feature.edit, feature.delete, sprint.manage,
--            bug.edit_any, bug.delete, label.manage, doc.manage, project.members
-- Giữ admin-only (KHÔNG mở): hồ sơ/lương thành viên, cấu hình, chi phí, audit log,
-- visits — toàn dữ liệu nhạy cảm hoặc surface phân quyền.

-- Sửa task bất kỳ (ngoài reporter/assignee như 0002/0024). has_perm bao admin nên bỏ
-- vế is_admin() riêng.
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    public.has_perm('task.edit_any')
    or reporter_id = (select auth.uid())
    or assignee_id = (select auth.uid())
  )
  with check (
    public.has_perm('task.edit_any')
    or reporter_id = (select auth.uid())
    or assignee_id = (select auth.uid())
  );

-- Feature: tách sửa / xoá thành hai quyền (tạo đã có 'feature.create', 0034).
drop policy if exists features_update on public.features;
create policy features_update on public.features
  for update to authenticated
  using ( public.has_perm('feature.edit') ) with check ( public.has_perm('feature.edit') );
drop policy if exists features_delete on public.features;
create policy features_delete on public.features
  for delete to authenticated using ( public.has_perm('feature.delete') );

-- Sprint: một quyền trùm tạo/sửa/xoá — màn Quản lý Sprint là một khối, tách lẻ không có nghĩa.
drop policy if exists sprints_insert on public.sprints;
create policy sprints_insert on public.sprints
  for insert to authenticated with check ( public.has_perm('sprint.manage') );
drop policy if exists sprints_update on public.sprints;
create policy sprints_update on public.sprints
  for update to authenticated
  using ( public.has_perm('sprint.manage') ) with check ( public.has_perm('sprint.manage') );
drop policy if exists sprints_delete on public.sprints;
create policy sprints_delete on public.sprints
  for delete to authenticated using ( public.has_perm('sprint.manage') );

-- Bug: sửa bug bất kỳ + xoá bug bất kỳ (reporter/assignee tự sửa, reporter tự xoá như cũ).
drop policy if exists bugs_update on public.bugs;
create policy bugs_update on public.bugs
  for update to authenticated
  using (
    public.has_perm('bug.edit_any')
    or reporter_id = (select auth.uid())
    or assignee_id = (select auth.uid())
  )
  with check ( true );
drop policy if exists bugs_delete on public.bugs;
create policy bugs_delete on public.bugs
  for delete to authenticated
  using ( public.has_perm('bug.delete') or reporter_id = (select auth.uid()) );

-- Nhãn: một quyền cho cả nhãn bug lẫn nhãn feature — cùng bản chất "sửa taxonomy chung".
drop policy if exists bug_labels_write on public.bug_labels;
create policy bug_labels_write on public.bug_labels
  for all to authenticated
  using ( public.has_perm('label.manage') ) with check ( public.has_perm('label.manage') );
drop policy if exists feature_labels_write on public.feature_labels;
create policy feature_labels_write on public.feature_labels
  for all to authenticated
  using ( public.has_perm('label.manage') ) with check ( public.has_perm('label.manage') );

-- Thư viện tài liệu (documents — nguồn RAG của bot): thêm/sửa/xoá tài liệu.
drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents
  for all to authenticated
  using ( public.has_perm('doc.manage') ) with check ( public.has_perm('doc.manage') );

-- Thành viên dự án: cho lead thêm/gỡ người khỏi dự án thay admin. Đi cùng 0073 thì
-- quyền này đồng nghĩa "tự cho mình vào dự án bất kỳ" — cấp có chủ đích.
drop policy if exists project_members_insert on public.project_members;
create policy project_members_insert on public.project_members
  for insert to authenticated with check ( public.has_perm('project.members') );
drop policy if exists project_members_delete on public.project_members;
create policy project_members_delete on public.project_members
  for delete to authenticated using ( public.has_perm('project.members') );
