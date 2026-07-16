-- Weekly report: mỗi project ghi vào MỘT Google Sheet riêng.
--
-- Đặt cạnh `notion_project_id` vì cùng bản chất: id của một tài nguyên ngoài, gắn theo
-- từng project, admin sửa được ngay trên web (popup Dự án) mà không phải đụng máy chạy bot
-- hay restart nó — khác `bug_forums` trong settings.json vốn phải sửa tay ở host.
--
-- Lưu ID chứ không lưu cả URL: URL Google Sheet còn kèm #gid=... và các tham số khác, so
-- sánh/ghép lại rất dễ sai. Web nhận link người dùng dán rồi tự bóc ID ra.
-- Rỗng/NULL = project chưa bật weekly report; bot sẽ bỏ qua chứ không báo lỗi.

alter table public.projects
  add column if not exists weekly_sheet_id text;

comment on column public.projects.weekly_sheet_id is
  'Google Spreadsheet ID (không phải URL) cho weekly report của project này. '
  'Rỗng = chưa bật. Service account của bot phải được share quyền Editor trên file đó.';

-- Không cần policy mới: `projects_update` (0001) đã gate admin, và cột mới nằm trong
-- chính bảng đó. RLS cũ phủ luôn.
