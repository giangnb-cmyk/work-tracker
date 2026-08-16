-- Forum Discord báo bug — MỖI PROJECT một forum riêng, cấu hình NGAY TRÊN WEB.
--
-- Trước đây cặp project ↔ forum chỉ nằm trong `bot/settings.json` (`bug_forums[]`), nên đổi
-- forum cho một dự án là phải vào máy chạy bot sửa JSON rồi restart. Mọi cấu hình per-project
-- khác (weekly_sheet_id 0022, release_sheet_id 0033, daily_report_webhook 0047, cost_sheet_id
-- 0060) đều đã nằm ở đây và sửa được từ popup Dự án — chỗ này là ngoại lệ cuối cùng.
--
-- `bug_forum_channel_id` để **text** chứ KHÔNG phải bigint: id kênh Discord là snowflake
-- 19 chữ số (1537305336187199559) > 2^53, PostgREST trả JSON number thì JS làm tròn SAI
-- (…199559 -> …199552) và bot đi tìm một kênh không tồn tại. Text là an toàn tuyệt đối.
--
-- RLS: không cần policy mới. `projects` đã có SELECT mở cho authenticated và UPDATE =
-- is_admin(), policy ở mức HÀNG nên tự phủ cột mới.
alter table public.projects
  add column if not exists bug_forum_channel_id text,
  add column if not exists bug_notify_role text;

comment on column public.projects.bug_forum_channel_id is
  'ID kênh Forum Discord đồng bộ bug hai chiều cho project (snowflake dạng chuỗi). '
  'Rỗng = project không đồng bộ bug với Discord.';

comment on column public.projects.bug_notify_role is
  'Tên HOẶC id role Discord được ping khi bug báo từ web tạo thành bài forum mới '
  '(vd "DEV M1"). Chỉ ping khi bug chưa giao cho ai. Rỗng = không ping.';
