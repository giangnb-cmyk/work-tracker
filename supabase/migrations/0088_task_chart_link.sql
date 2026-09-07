-- 0088 — Gắn task vào chart tốc độ TỪ PHÍA TASK + số đơn vị riêng của từng task.
--
-- 0087 cho chart chọn task (velocity_charts.task_ids) hoặc theo feature. Người làm muốn
-- chiều ngược lại: mở task, chọn "tính vào chart nào", và khai task này tương đương bao nhiêu
-- đơn vị của chart (task "Model 3 station" = 3 model, task "sửa nhỏ" = 0.5). Hai thứ đó
-- thuộc về TASK nên nằm ở hàng task:
--   • chart_id  — chart nhận task này. FK set null: xoá chart thì task tự gỡ, không mồ côi.
--   • chart_qty — số đơn vị của task trong chart. NULL = 1 (mỗi task một đơn vị).
--
-- Phạm vi chart (web, lib/velocityLink.ts) = task theo feature / task_ids của chart ∪ task
-- có chart_id trỏ về chart. Chế độ đếm 'tasks' cộng chart_qty (mặc định 1) thay cho đếm
-- đầu task cứng 1 — nên "đếm theo đơn vị tự khai" không cần count_by mới.
--
-- RLS không đổi: hai cột này đi theo tasks_update (admin / task.edit_any / reporter /
-- assignee) — đúng người sửa được task thì gắn được task vào chart. Realtime: tasks đã
-- trong publication với replica identity full (0021).

alter table public.tasks
  add column if not exists chart_id uuid references public.velocity_charts (id) on delete set null,
  add column if not exists chart_qty numeric check (chart_qty is null or chart_qty >= 0);

create index if not exists tasks_chart_idx on public.tasks (chart_id) where chart_id is not null;

comment on column public.tasks.chart_id is
  'Chart tốc độ (velocity_charts) mà task này tính vào — gắn từ chi tiết task (0088). NULL = không gắn.';
comment on column public.tasks.chart_qty is
  'Số đơn vị của task trong chart (vd 3 model). NULL = 1.';
