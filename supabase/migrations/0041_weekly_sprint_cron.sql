-- 0041 — Tự tạo sprint mỗi tuần bằng pg_cron. Sprint là "active" theo THỜI GIAN, không
-- theo cột status (web: activeSprintAt) — nên chỉ cần tuần nào cũng có đúng một sprint phủ
-- tuần đó, task tạo trong tuần bám vào cuối tuần của nó.
--
-- pg_cron chạy TRONG database (luôn bật, không phụ thuộc bot self-host).
create extension if not exists pg_cron;

-- ensure_week_sprint: đảm bảo có sprint cho TUẦN HIỆN TẠI (giờ VN, T2→CN). Idempotent —
-- gọi lại bao nhiêu lần cũng không đẻ trùng.
create or replace function public.ensure_week_sprint()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  vn_now   timestamp   := (pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh');
  monday   date        := (pg_catalog.date_trunc('week', vn_now))::date;  -- ISO week: T2
  -- Biên tuần [T2 00:00 VN, CN 23:59:59.999 VN] quy về timestamptz.
  wk_start timestamptz := (monday::timestamp) at time zone 'Asia/Ho_Chi_Minh';
  wk_end   timestamptz := ((monday + 7)::timestamp) at time zone 'Asia/Ho_Chi_Minh'
                          - pg_catalog.make_interval(secs => 0.001);
  existing uuid;
  new_id   uuid;
begin
  -- Dọn cột status: sprint đã hết hạn mà còn badge 'active' -> 'completed'. Active giờ tính
  -- theo ngày, status chỉ để hiển thị — để nó lệch thực tế thì SprintManager gây hiểu nhầm.
  update public.sprints set status = 'completed'
    where status = 'active' and end_date is not null and end_date < pg_catalog.now();

  -- Đã có sprint nào GIAO với tuần này chưa? Dùng OVERLAP chứ không phải contains: sprint cũ
  -- tạo tay lưu mốc theo UTC-midnight, lệch giờ VN vài tiếng — contains sẽ bỏ sót và đẻ trùng.
  select id into existing from public.sprints
    where start_date <= wk_end and end_date >= wk_start
    order by start_date desc
    limit 1;
  if existing is not null then
    return existing;
  end if;

  insert into public.sprints (name, status, start_date, end_date)
  values (
    'Sprint tuần ' || pg_catalog.to_char(monday, 'DD/MM')
                   || '–' || pg_catalog.to_char(monday + 6, 'DD/MM'),
    'active', wk_start, wk_end
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- Chỉ cron gọi (chạy bằng quyền chủ bảng, bỏ qua RLS). Không mở cho client.
revoke execute on function public.ensure_week_sprint() from public, anon, authenticated;

-- Lịch: mỗi thứ 2 00:05 VN = Chủ nhật 17:05 UTC (pg_cron chạy theo UTC). Đặt lại tên job
-- an toàn khi chạy migration nhiều lần.
do $$
begin
  perform cron.unschedule('weekly-sprint');
exception when others then null;  -- chưa từng đặt -> bỏ qua
end $$;
select cron.schedule('weekly-sprint', '5 17 * * 0', 'select public.ensure_week_sprint();');

-- Tạo luôn sprint cho tuần hiện tại (khỏi đợi tới thứ 2 sau). Có sprint tuần này rồi thì
-- hàm trả về id cũ, không đẻ trùng.
select public.ensure_week_sprint();
