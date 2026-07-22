-- Gán khoản chi phí thiết bị/vận hành cho TỪNG NGƯỜI (tab Chi phí, khu quản trị).
--
-- Mô hình đổi: bỏ cờ per_employee (× cả headcount, quá thô) — giờ project_cost_items là
-- DANH MỤC; từng nhân sự (và từng dòng dự chi) multi-select các khoản của mình. Khoản
-- one_time tính 1 lần/người; khoản annual chia theo SỐ THÁNG LÀM VIỆC của người đó (×/12).
-- Khoản không gán cho ai vẫn tính MỘT lần cho cả dự án (Văn phòng, Điện… — chi phí chung).
--
-- RLS admin-only cả đọc lẫn ghi như mọi bảng chi phí (0053/0054).

-- Ai được gán khoản nào: 1 dòng / (dự án, người), item_ids là mảng id vào project_cost_items.
-- Id khoản đã xoá có thể còn sót trong mảng — phía đọc lọc theo danh mục hiện có, vô hại.
create table public.project_cost_member_items (
  project_id uuid not null references public.projects (id) on delete cascade,
  member_id  uuid not null references public.profiles (id) on delete cascade,
  item_ids   uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (project_id, member_id)
);
alter table public.project_cost_member_items enable row level security;

create policy project_cost_member_items_select on public.project_cost_member_items
  for select to authenticated using ( public.is_admin() );
create policy project_cost_member_items_insert on public.project_cost_member_items
  for insert to authenticated with check ( public.is_admin() );
create policy project_cost_member_items_update on public.project_cost_member_items
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy project_cost_member_items_delete on public.project_cost_member_items
  for delete to authenticated using ( public.is_admin() );

alter table public.project_cost_member_items replica identity full;
alter publication supabase_realtime add table public.project_cost_member_items;

-- Dự chi cũng chọn được khoản chi phí (mỗi suất tuyển kèm PC/ghế/bản quyền…).
alter table public.project_cost_projections
  add column if not exists item_ids uuid[] not null default '{}';

-- Bỏ cờ × đầu người — thay bằng gán theo người ở trên.
alter table public.project_cost_items drop column if exists per_employee;
