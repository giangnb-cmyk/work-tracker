-- 0085 — Tab Gantt: theo dõi TỐC ĐỘ một dòng công việc (vd "Model 3D": 120 model từ
-- 01/09 → 30/09) và tự tính mỗi NGÀY CÔNG phải làm bao nhiêu để kịp deadline.
--
-- Hai bảng:
--   • velocity_charts — mỗi hàng là một "chart": khoảng thời gian, khối lượng, đã làm,
--     tốc độ (tuỳ chọn — trống thì web tự đo từ đã làm / số ngày công đã qua), người tham
--     gia (uuid[] để đếm nhân sự theo role). Thuộc MỘT dự án, cùng khuôn project_docs.
--   • holidays — ngày lễ DÙNG CHUNG cả công ty (không theo dự án: nghỉ lễ là nghỉ cả đội).
--     Ngày công = T2–T6 trừ các ngày trong bảng này; web tính, DB chỉ giữ danh sách.
--
-- Số liệu khối lượng để numeric: có việc đếm theo "nửa model", "1.5 màn".
-- Không FK member_ids → profiles (mảng): người rời nhóm thì chart vẫn giữ lịch sử ai đã
-- tham gia; web tra roster để hiện avatar, không khớp thì bỏ qua.

create table public.velocity_charts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  -- Đơn vị khối lượng hiện cạnh con số: "model", "map", "màn"…
  unit        text not null default 'việc' check (char_length(unit) between 1 and 30),
  start_date  date not null,
  end_date    date not null,
  total_qty   numeric not null default 0 check (total_qty >= 0),
  done_qty    numeric not null default 0 check (done_qty >= 0),
  -- Tốc độ hiện tại người dùng nhập (đơn vị / ngày công). NULL = để web tự đo.
  velocity    numeric check (velocity is null or velocity >= 0),
  member_ids  uuid[] not null default '{}',
  note        text not null default '',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  constraint velocity_charts_dates_chk check (end_date >= start_date)
);

create index velocity_charts_project_idx on public.velocity_charts (project_id);

alter table public.velocity_charts enable row level security;

-- Đọc: cùng luật thấy dự án (0073) — admin hoặc người trong dự án.
create policy velocity_charts_select on public.velocity_charts
  for select to authenticated
  using ( public.is_admin() or public.is_project_member(project_id) );

-- Thêm: người trong dự án; created_by ép đúng người gọi (không mạo danh) — như project_docs.
create policy velocity_charts_insert on public.velocity_charts
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and ( public.is_admin() or public.is_project_member(project_id) )
  );

-- Sửa/xoá: admin, người tạo, hoặc member có 'sprint.manage' (người điều phối sprint cũng
-- là người canh tốc độ) — chart là công cụ kế hoạch chung nên không khoá chặt về admin.
create policy velocity_charts_update on public.velocity_charts
  for update to authenticated
  using (
    public.is_admin() or created_by = (select auth.uid()) or public.has_perm('sprint.manage')
  )
  with check (
    public.is_admin() or created_by = (select auth.uid()) or public.has_perm('sprint.manage')
  );

create policy velocity_charts_delete on public.velocity_charts
  for delete to authenticated
  using (
    public.is_admin() or created_by = (select auth.uid()) or public.has_perm('sprint.manage')
  );

-- Realtime + replica identity full: event DELETE phải mang đủ cột cho bộ lọc project_id.
alter publication supabase_realtime add table public.velocity_charts;
alter table public.velocity_charts replica identity full;

-- ---------------------------------------------------------------------------
-- Ngày lễ toàn công ty. Khoá chính là chính ngày đó — một ngày chỉ có một lý do nghỉ.
-- ---------------------------------------------------------------------------
create table public.holidays (
  day   date primary key,
  name  text not null default '' check (char_length(name) <= 80)
);

alter table public.holidays enable row level security;

create policy holidays_select on public.holidays
  for select to authenticated using (true);

-- Quản lý ngày lễ: admin hoặc 'sprint.manage' — cùng người lo lịch làm việc của đội.
create policy holidays_insert on public.holidays
  for insert to authenticated
  with check ( public.is_admin() or public.has_perm('sprint.manage') );

create policy holidays_update on public.holidays
  for update to authenticated
  using ( public.is_admin() or public.has_perm('sprint.manage') )
  with check ( public.is_admin() or public.has_perm('sprint.manage') );

create policy holidays_delete on public.holidays
  for delete to authenticated
  using ( public.is_admin() or public.has_perm('sprint.manage') );

alter publication supabase_realtime add table public.holidays;
