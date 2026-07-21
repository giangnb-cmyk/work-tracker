-- 0051 — Chỉ OWNER được SỬA dự án (trước đây là bất kỳ admin nào).
--
-- Theo yêu cầu: cấu hình dự án (webhook báo cáo, liên kết Notion, Google Sheet…) chỉ chủ
-- sở hữu được đụng. Web đã ẩn nút ⚙ với người không phải owner; đây là lớp chặn ở DB (RLS).
-- Chỉ đổi UPDATE; INSERT/DELETE giữ nguyên is_admin(). Bot dùng service_role (bỏ qua RLS)
-- nên vẫn theo gate riêng trong permissions.py.
alter policy projects_update on public.projects
  using (public.is_owner())
  with check (public.is_owner());
