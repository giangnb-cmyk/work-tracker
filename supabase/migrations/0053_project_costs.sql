-- project_costs: dữ liệu tính CHI PHÍ của một dự án cho tab "Chi phí" (phần Quản trị).
-- Ba bảng project-scoped:
--   1) project_cost_employees   — lương thực tế của từng thành viên (theo thời gian).
--   2) project_cost_items        — chi phí thiết bị/vận hành (1 lần hoặc theo năm).
--   3) project_cost_projections  — DỰ CHI (what-if): tuyển thêm + thuê ngoài (outsource).
--
-- RLS khoá ADMIN-ONLY cho CẢ ĐỌC LẪN GHI — khác các bảng khác vốn mở đọc: đây là dữ liệu
-- LƯƠNG (nhạy cảm), thành viên thường không được nhìn. `is_admin()` (0037) đã bao owner.
-- Realtime theo khuôn 0052: replica identity full để event DELETE mang đủ project_id cho
-- bộ lọc realtime (project_id=eq.<id>) khớp.

-- 1) Lương thực tế: mỗi thành viên dự án MỘT dòng (chọn từ project_members, không gõ tên tự do).
create table public.project_cost_employees (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  member_id      uuid not null references public.profiles (id) on delete cascade,
  monthly_salary numeric not null default 0,
  start_date     date,
  end_date       date,
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,
  unique (project_id, member_id)
);
alter table public.project_cost_employees enable row level security;

-- 2) Chi phí thiết bị/vận hành. kind: one_time (1 lần) | annual (theo năm).
--    per_employee = nhân theo số nhân sự (vd mỗi người 1 bộ PC) thay vì 1 khoản cố định.
create table public.project_cost_items (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  name         text not null,
  amount       numeric not null default 0,
  kind         text not null default 'annual' check (kind in ('one_time', 'annual')),
  per_employee boolean not null default false,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null
);
alter table public.project_cost_items enable row level security;
create index project_cost_items_project_idx on public.project_cost_items (project_id);

-- 3) Dự chi. kind: hire (tuyển thêm) | outsource (thuê ngoài).
--    cadence quyết định cách nhân theo khoảng tháng: monthly (×tháng) | one_time (×1) | annual (×tháng/12).
--    head_count = số người/số suất (mặc định 1).
create table public.project_cost_projections (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind       text not null default 'hire' check (kind in ('hire', 'outsource')),
  label      text not null default '',
  amount     numeric not null default 0,
  cadence    text not null default 'monthly' check (cadence in ('monthly', 'one_time', 'annual')),
  head_count int  not null default 1,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);
alter table public.project_cost_projections enable row level security;
create index project_cost_projections_project_idx on public.project_cost_projections (project_id);

-- RLS: mọi thao tác chỉ admin/owner. (project_cost_employees có unique(project_id, member_id)
-- nên đã có index tra theo project_id, không cần thêm.)
create policy project_cost_employees_select on public.project_cost_employees
  for select to authenticated using ( public.is_admin() );
create policy project_cost_employees_insert on public.project_cost_employees
  for insert to authenticated with check ( public.is_admin() );
create policy project_cost_employees_update on public.project_cost_employees
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy project_cost_employees_delete on public.project_cost_employees
  for delete to authenticated using ( public.is_admin() );

create policy project_cost_items_select on public.project_cost_items
  for select to authenticated using ( public.is_admin() );
create policy project_cost_items_insert on public.project_cost_items
  for insert to authenticated with check ( public.is_admin() );
create policy project_cost_items_update on public.project_cost_items
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy project_cost_items_delete on public.project_cost_items
  for delete to authenticated using ( public.is_admin() );

create policy project_cost_projections_select on public.project_cost_projections
  for select to authenticated using ( public.is_admin() );
create policy project_cost_projections_insert on public.project_cost_projections
  for insert to authenticated with check ( public.is_admin() );
create policy project_cost_projections_update on public.project_cost_projections
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy project_cost_projections_delete on public.project_cost_projections
  for delete to authenticated using ( public.is_admin() );

-- Realtime (xem lý do replica identity full ở đầu file).
alter table public.project_cost_employees   replica identity full;
alter table public.project_cost_items        replica identity full;
alter table public.project_cost_projections  replica identity full;
alter publication supabase_realtime add table public.project_cost_employees;
alter publication supabase_realtime add table public.project_cost_items;
alter publication supabase_realtime add table public.project_cost_projections;
