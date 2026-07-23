-- Kế hoạch tài chính cho tab Chi phí: thưởng Tết, doanh thu dự kiến theo tháng, và dự tính
-- tăng lương của từng người. Tất cả RLS ADMIN-ONLY cả đọc lẫn ghi (cùng chuẩn 0053/0054).

-- 0) UI đã thêm loại chi phí "Theo tháng" — CHECK cũ (0053) chỉ cho one_time|annual, lưu
--    'monthly' là DB chặn. Nới CHECK trước khi ai đó dẫm phải.
alter table public.project_cost_items drop constraint if exists project_cost_items_kind_check;
alter table public.project_cost_items
  add constraint project_cost_items_kind_check check (kind in ('one_time', 'monthly', 'annual'));

-- 1) Cấu hình chi phí theo dự án — hiện chỉ có thưởng Tết: mặc định 1 THÁNG LƯƠNG/người,
--    chỉnh được số tháng; trả vào tháng dương `tet_bonus_month` mỗi năm (mặc định tháng 1).
create table public.project_cost_settings (
  project_id       uuid primary key references public.projects (id) on delete cascade,
  tet_bonus_months numeric not null default 1,
  tet_bonus_month  int not null default 1 check (tet_bonus_month between 1 and 12),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id) on delete set null
);
alter table public.project_cost_settings enable row level security;

-- 2) Doanh thu DỰ KIẾN theo tháng (month = ngày đầu tháng).
create table public.project_revenue (
  project_id uuid not null references public.projects (id) on delete cascade,
  month      date not null,
  amount     numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (project_id, month)
);
alter table public.project_revenue enable row level security;

-- 3) DỰ TÍNH tăng lương: từ `effective_from` lương người này thành `monthly_salary`.
--    Toàn cục theo người (như member_compensation); phần tính chi phí đọc thành bậc thang.
create table public.member_salary_plan (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.profiles (id) on delete cascade,
  effective_from date not null,
  monthly_salary numeric not null,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null
);
alter table public.member_salary_plan enable row level security;
create index member_salary_plan_member_idx on public.member_salary_plan (member_id, effective_from);

-- RLS admin-only ×3 bảng.
create policy project_cost_settings_select on public.project_cost_settings
  for select to authenticated using ( public.is_admin() );
create policy project_cost_settings_insert on public.project_cost_settings
  for insert to authenticated with check ( public.is_admin() );
create policy project_cost_settings_update on public.project_cost_settings
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy project_cost_settings_delete on public.project_cost_settings
  for delete to authenticated using ( public.is_admin() );

create policy project_revenue_select on public.project_revenue
  for select to authenticated using ( public.is_admin() );
create policy project_revenue_insert on public.project_revenue
  for insert to authenticated with check ( public.is_admin() );
create policy project_revenue_update on public.project_revenue
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy project_revenue_delete on public.project_revenue
  for delete to authenticated using ( public.is_admin() );

create policy member_salary_plan_select on public.member_salary_plan
  for select to authenticated using ( public.is_admin() );
create policy member_salary_plan_insert on public.member_salary_plan
  for insert to authenticated with check ( public.is_admin() );
create policy member_salary_plan_update on public.member_salary_plan
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy member_salary_plan_delete on public.member_salary_plan
  for delete to authenticated using ( public.is_admin() );

-- Realtime (khuôn 0052: replica identity full cho event DELETE mang đủ cột lọc).
alter table public.project_cost_settings replica identity full;
alter table public.project_revenue       replica identity full;
alter table public.member_salary_plan    replica identity full;
alter publication supabase_realtime add table public.project_cost_settings;
alter publication supabase_realtime add table public.project_revenue;
alter publication supabase_realtime add table public.member_salary_plan;
