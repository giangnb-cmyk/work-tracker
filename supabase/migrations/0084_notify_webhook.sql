-- 0084 — Tách webhook THÔNG BÁO TASK khỏi webhook BÁO CÁO 10:30.
--
-- Lịch sử: 0047 thêm `daily_report_webhook` cho báo cáo 10:30, rồi kênh đó dần thành webhook
-- CHUNG của dự án (task mới, task xong, subtask, tài liệu mới — web /api/notify-discord, bot
-- task_ops, lẫn Edge Function daily-report). Giờ đội muốn báo cáo daily đi kênh RIÊNG, nên
-- trả lại đúng tên: `notify_webhook` = kênh task (mọi thông báo), `daily_report_webhook` =
-- CHỈ báo cáo 10:30, RỖNG thì báo cáo rơi về notify_webhook.
--
-- Backfill COPY (không xoá `daily_report_webhook`): code cũ đang chạy (Vercel function, bot
-- chưa restart, Edge Function bản cũ) vẫn đọc cột cũ — copy giữ cả hai bằng nhau nên không
-- có khoảng trống thông báo giữa lúc áp migration và lúc deploy code mới. Web UI mới sẽ tự
-- "chữa" dần: hai cột trùng nhau thì lưu lại daily = null (nghĩa là "đi chung kênh task").
--
-- RLS: như 0047 — SELECT mở cho authenticated, UPDATE theo policy hàng của projects, cột
-- mới tự được phủ. Webhook là capability URL, chấp nhận được cho công cụ nội bộ.

alter table public.projects
  add column if not exists notify_webhook text;

update public.projects
   set notify_webhook = daily_report_webhook
 where notify_webhook is null and daily_report_webhook is not null;

comment on column public.projects.notify_webhook is
  'Webhook Discord kênh task của dự án: task mới, task xong, xong subtask, tài liệu mới. Rỗng = không gửi thông báo.';
comment on column public.projects.daily_report_webhook is
  'Webhook RIÊNG cho báo cáo task 10:30 hằng ngày. Rỗng = báo cáo gửi vào notify_webhook (0084). Trước 0084 cột này là webhook chung.';
