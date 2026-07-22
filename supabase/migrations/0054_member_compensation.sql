-- member_compensation: LƯƠNG + thời gian làm việc của một NGƯỜI (toàn cục, KHÔNG theo dự án).
-- Điền ở phần chi tiết thành viên (MemberModal, tab Thành viên). Chi phí từng dự án lấy mức
-- lương này cho các thành viên của dự án (project_members) — "pick người là có thông tin luôn".
--
-- Vì sao TÁCH bảng riêng chứ không thêm cột vào profiles: lương là dữ liệu NHẠY CẢM, chỉ
-- admin/owner được xem; profiles thì mọi user đã đăng nhập đọc được (RLS mở đọc) nên nhét
-- lương vào đó là lộ. Bảng này RLS admin-only cho CẢ ĐỌC lẫn GHI (is_admin() đã bao owner).
create table public.member_compensation (
  member_id      uuid primary key references public.profiles (id) on delete cascade,
  monthly_salary numeric not null default 0,
  start_date     date,
  end_date       date,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id) on delete set null
);
alter table public.member_compensation enable row level security;

-- Chuyển dữ liệu từ bảng lương theo-dự-án cũ (nếu có): mỗi người lấy mức lương CAO NHẤT.
insert into public.member_compensation (member_id, monthly_salary, start_date, end_date)
select distinct on (member_id) member_id, monthly_salary, start_date, end_date
from public.project_cost_employees
order by member_id, monthly_salary desc
on conflict (member_id) do nothing;

create policy member_compensation_select on public.member_compensation
  for select to authenticated using ( public.is_admin() );
create policy member_compensation_insert on public.member_compensation
  for insert to authenticated with check ( public.is_admin() );
create policy member_compensation_update on public.member_compensation
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy member_compensation_delete on public.member_compensation
  for delete to authenticated using ( public.is_admin() );

-- Realtime (replica identity full để event DELETE mang đủ cột — cùng lý do các bảng khác).
alter table public.member_compensation replica identity full;
alter publication supabase_realtime add table public.member_compensation;

-- Bỏ bảng lương theo-dự-án (đã thay bằng member_compensation toàn cục). Drop tự gỡ khỏi
-- publication supabase_realtime. project_cost_items / project_cost_projections vẫn giữ nguyên.
drop table if exists public.project_cost_employees;
