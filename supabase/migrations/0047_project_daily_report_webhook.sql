-- Webhook Discord cho báo cáo task hằng ngày (10:30) — MỖI PROJECT một webhook riêng.
-- Admin đặt trong web (ProjectModal); job daily-report ngoài (đọc bằng service_role) gửi
-- report của từng project vào webhook tương ứng.
--
-- RLS: không cần policy mới. projects đã có SELECT mở cho authenticated và UPDATE = is_admin()
-- (row-level nên tự phủ cột mới). LƯU Ý: SELECT mở nghĩa là mọi thành viên đăng nhập đọc
-- được URL này (webhook là "capability URL"); chấp nhận được cho công cụ nội bộ.
alter table public.projects
  add column if not exists daily_report_webhook text;

comment on column public.projects.daily_report_webhook is
  'Discord webhook URL cho báo cáo task hằng ngày của project (rỗng = không gửi).';
