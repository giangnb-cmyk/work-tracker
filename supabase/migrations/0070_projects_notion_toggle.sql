-- Bật/tắt đồng bộ Notion theo TỪNG dự án.
--
-- Trước đây tạo task ở bất kỳ dự án nào cũng đẻ một trang Notion (web: syncNewToNotion
-- trong taskWrites.ts; bot: _sync_create trong task_ops.py) — cấu hình duy nhất là biến
-- môi trường NOTION_TOKEN/NOTION_DATABASE_ID, tức là BẬT/TẮT CHO CẢ APP. Dự án mới không
-- dùng Notion vẫn rải trang vào database dùng chung của công ty.
--
-- `notion_project_id` KHÔNG thay được cờ này: dự án có thể muốn tắt sync mà vẫn giữ liên
-- kết (bật lại là chạy tiếp), và một dự án chưa liên kết vẫn đang tạo trang Notion không
-- gắn quan hệ Project — đúng cái cần chặn.
--
-- Mặc định TRUE = giữ nguyên hành vi hiện tại cho các dự án đang chạy; tắt là việc chủ động.
--
-- RLS: không cần policy mới (projects đã có SELECT cho authenticated, UPDATE = is_admin();
-- policy ở mức HÀNG nên tự phủ cột mới).
alter table public.projects
  add column if not exists notion_sync_enabled boolean not null default true;

comment on column public.projects.notion_sync_enabled is
  'false = tạo task trong dự án này KHÔNG tạo trang Notion (cả web lẫn bot). Nút "Sync Notion" ở từng task cũng ẩn. Mặc định true.';
