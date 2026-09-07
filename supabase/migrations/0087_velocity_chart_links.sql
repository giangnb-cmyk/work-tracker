-- 0087 — Chart tốc độ LINK với task: đã xong lấy tự động từ task done thay vì ghi tay.
--
-- Ba nguồn tiến độ (link_kind):
--   • manual  — như 0085/0086: nhập tay + nhật ký theo ngày.
--   • feature — phạm vi = mọi task của MỘT feature (tasks.feature_id).
--   • tasks   — phạm vi = danh sách task chọn tay (task_ids).
-- Đếm theo count_by: 'tasks' (mỗi task = 1 đơn vị) hoặc 'points' (cộng story points).
--
-- Web tính (lib/velocityLink.ts), DB chỉ giữ cấu hình: đã xong = task done trong phạm vi;
-- đường "tiến độ thật" dựng từ NGÀY HOÀN THÀNH (tasks.due_date của task done = ngày xong
-- thật, xem updateTask/moveTask). total_qty vẫn dùng được làm khối lượng KẾ HOẠCH khi
-- feature còn thêm task dần: > 0 thì lấy, = 0 thì tổng = số task trong phạm vi.
--
-- task_ids là uuid[] không FK (như member_ids): task bị xoá thì tự rơi khỏi phạm vi khi
-- web tra không thấy, không cần dọn. feature_id có FK set null: feature xoá → chart về
-- trạng thái "phạm vi trống", người dùng thấy ngay để chỉnh.

alter table public.velocity_charts
  add column if not exists link_kind text not null default 'manual'
    check (link_kind in ('manual', 'feature', 'tasks')),
  add column if not exists feature_id uuid references public.features (id) on delete set null,
  add column if not exists task_ids uuid[] not null default '{}',
  add column if not exists count_by text not null default 'tasks'
    check (count_by in ('tasks', 'points'));

comment on column public.velocity_charts.link_kind is
  'Nguồn tiến độ: manual (nhập tay) | feature (task của feature_id) | tasks (task_ids). 0087.';
comment on column public.velocity_charts.count_by is
  'Cách đếm khi link: tasks = mỗi task 1 đơn vị; points = cộng story points.';
