-- 0086 — Gantt tốc độ: NHẬT KÝ TIẾN ĐỘ theo ngày + MỐC CẦN XONG (tuỳ chọn).
--
-- Vì sao cần nhật ký: đồ thị burn-up ("tiến độ thật" theo ngày, có bậc phẳng qua cuối
-- tuần) không vẽ được từ MỘT con số done_qty — phải biết tới ngày nào đã xong bao nhiêu.
-- Mỗi hàng = "tới hết ngày `day`, đã xong CỘNG DỒN `done_qty`". Một ngày một hàng
-- (khoá chính chart_id + day): ghi lại cùng ngày = sửa số, không đẻ hàng mới.
--
-- `done_qty` trên velocity_charts VẪN là con số hiện tại cho dòng Gantt/kế hoạch — trigger
-- bên dưới tự đồng bộ nó = mục nhật ký MỚI NHẤT, nên hai nơi không lệch nhau và member
-- (không có quyền sửa chart) vẫn ghi tiến độ được.
--
-- `target_date` — "mốc cần xong" sớm hơn deadline: nhịp cần/ngày tính tới mốc này (đường
-- cam trên đồ thị), còn `end_date` vẫn là deadline cứng (vạch đỏ). Trống = mốc = deadline.

alter table public.velocity_charts
  add column if not exists target_date date;

alter table public.velocity_charts
  add constraint velocity_charts_target_chk
  check (target_date is null or (target_date >= start_date and target_date <= end_date));

comment on column public.velocity_charts.target_date is
  'Mốc cần xong (tuỳ chọn, trong [start_date, end_date]). Nhịp cần/ngày tính tới mốc này; NULL = tới end_date.';

-- ---------------------------------------------------------------------------
create table public.velocity_chart_progress (
  chart_id    uuid not null references public.velocity_charts (id) on delete cascade,
  day         date not null,
  -- CỘNG DỒN tới hết ngày đó (không phải số làm trong ngày) — nhập một số là xong, khỏi cộng tay.
  done_qty    numeric not null check (done_qty >= 0),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (chart_id, day)
);

alter table public.velocity_chart_progress enable row level security;

-- Quyền đi theo CHART: ai thấy được chart (RLS velocity_charts_select đã lo admin / người
-- trong dự án) thì thấy nhật ký; và ai thấy chart thì GHI được nhật ký — người làm việc
-- phải tự ghi tiến độ của mình, không thể chờ admin. Subquery chạy dưới RLS của
-- velocity_charts nên không cần lặp lại điều kiện dự án ở đây.
create policy velocity_chart_progress_select on public.velocity_chart_progress
  for select to authenticated
  using ( exists (select 1 from public.velocity_charts c where c.id = chart_id) );

create policy velocity_chart_progress_insert on public.velocity_chart_progress
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.velocity_charts c where c.id = chart_id)
  );

create policy velocity_chart_progress_update on public.velocity_chart_progress
  for update to authenticated
  using ( exists (select 1 from public.velocity_charts c where c.id = chart_id) )
  with check ( exists (select 1 from public.velocity_charts c where c.id = chart_id) );

create policy velocity_chart_progress_delete on public.velocity_chart_progress
  for delete to authenticated
  using ( exists (select 1 from public.velocity_charts c where c.id = chart_id) );

alter publication supabase_realtime add table public.velocity_chart_progress;
alter table public.velocity_chart_progress replica identity full;

-- ---------------------------------------------------------------------------
-- Đồng bộ velocity_charts.done_qty = mục nhật ký MỚI NHẤT (theo ngày) sau mỗi lần ghi/sửa/xoá.
-- SECURITY DEFINER có chủ đích: member ghi nhật ký không có quyền UPDATE velocity_charts
-- (RLS: admin/người tạo/sprint.manage), mà con số hiện tại vẫn phải đổi theo. Hàm chỉ ghi
-- đúng MỘT cột của đúng chart vừa được ghi nhật ký — không mở thêm gì khác.
-- Xoá hết nhật ký thì giữ nguyên done_qty cũ (không có gì tốt hơn để ghi).
create or replace function public.velocity_progress_sync_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chart uuid := coalesce(new.chart_id, old.chart_id);
  v_latest numeric;
begin
  select done_qty into v_latest
  from public.velocity_chart_progress
  where chart_id = v_chart
  order by day desc
  limit 1;
  if v_latest is not null then
    update public.velocity_charts
       set done_qty = v_latest
     where id = v_chart and done_qty is distinct from v_latest;
  end if;
  return null;
end;
$$;

revoke execute on function public.velocity_progress_sync_done() from public, anon, authenticated;

drop trigger if exists velocity_progress_sync_done on public.velocity_chart_progress;
create trigger velocity_progress_sync_done
  after insert or update or delete on public.velocity_chart_progress
  for each row execute function public.velocity_progress_sync_done();
