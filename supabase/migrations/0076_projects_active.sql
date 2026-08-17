-- Bật/tắt một dự án. Dự án TẠM DỪNG (is_active = false) không còn bị mọi việc chạy nền
-- đụng tới: nhắc task hằng ngày, báo cáo 10:30, weekly report, DM tuần, đồng bộ bug forum.
--
-- Vì sao là CỜ chứ không phải xoá: dự án đóng băng vẫn cần tra cứu (task cũ, bug cũ, thống
-- kê, chi phí). Xoá là mất hết; để nguyên thì mỗi sáng cả đội vẫn bị nhắc về một dự án
-- không ai còn làm.
--
-- Mặc định TRUE — mọi dự án đang có giữ nguyên hành vi; tạm dừng là việc chủ động.
--
-- CỐ Ý không đụng RLS: dự án tạm dừng vẫn ĐỌC/GHI bình thường trong app (vào xem, sửa nốt
-- một task cũ). Cờ này chỉ chặn TỰ ĐỘNG, không phải khoá cửa — khoá cửa thì đã có
-- project_members. Policy update của `projects` vẫn là is_admin() nên chỉ admin bật/tắt được.
alter table public.projects
  add column if not exists is_active boolean not null default true;

comment on column public.projects.is_active is
  'false = dự án TẠM DỪNG: bỏ qua mọi việc chạy nền (nhắc task, báo cáo 10:30, weekly report, '
  'DM tuần, sync bug forum). Vẫn xem/sửa được trong app. Mặc định true.';

-- Các job nền đều lọc theo cột này, và luôn lọc "chỉ lấy dự án đang chạy" -> index một phía
-- là đủ (số dự án nhỏ, nhưng index này cũng miễn phí).
create index if not exists projects_active_idx on public.projects (is_active) where is_active;
