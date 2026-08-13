-- 0068 — Sprint thuộc VỀ MỘT DỰ ÁN (trước đây toàn cục, mọi dự án nhìn chung một list —
-- tạo dự án mới là thấy nguyên sprint của dự án cũ, lỗi đã bị báo).
--
-- Ba việc trong một migration:
--   1) `sprints.project_id` + backfill về dự án đầu tiên (toàn bộ sprint hiện có đều của
--      M1 — thời điểm áp chỉ có đúng một dự án) rồi khoá NOT NULL: mọi đường tạo sprint
--      từ nay PHẢI nói rõ của dự án nào, quên là fail ngay chứ không đẻ sprint mồ côi.
--   2) `ensure_week_sprint()` (cron 0041) tạo sprint tuần cho TỪNG dự án — cùng logic
--      tạo, mỗi dự án một bản độc lập.
--   3) Trigger sau khi INSERT dự án: gọi luôn ensure_week_sprint() — dự án lập giữa tuần
--      có ngay sprint tuần này, không phải đợi cron thứ 2.

alter table public.sprints
  add column project_id uuid references public.projects (id) on delete cascade;

update public.sprints s
set project_id = p.id
from (select id from public.projects order by created_at limit 1) p
where s.project_id is null;

alter table public.sprints alter column project_id set not null;
create index sprints_project_idx on public.sprints (project_id);

-- Đổi kiểu trả về (uuid -> integer: SỐ sprint vừa tạo) nên phải drop trước —
-- CREATE OR REPLACE không đổi được return type. Câu lệnh trong cron job giữ nguyên.
drop function public.ensure_week_sprint();

create function public.ensure_week_sprint()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  vn_now   timestamp   := (pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh');
  monday   date        := (pg_catalog.date_trunc('week', vn_now))::date;  -- ISO week: T2
  wk_start timestamptz := (monday::timestamp) at time zone 'Asia/Ho_Chi_Minh';
  wk_end   timestamptz := ((monday + 7)::timestamp) at time zone 'Asia/Ho_Chi_Minh'
                          - pg_catalog.make_interval(secs => 0.001);
  prj      record;
  created  integer := 0;
begin
  -- Dọn cột status: sprint đã hết hạn mà còn badge 'active' -> 'completed' (như 0041).
  update public.sprints set status = 'completed'
    where status = 'active' and end_date is not null and end_date < pg_catalog.now();

  -- MỖI dự án một sprint/tuần. Idempotent theo từng dự án: đã có sprint GIAO với tuần
  -- này (overlap, không phải contains — sprint tạo tay lệch múi giờ vài tiếng) thì thôi.
  for prj in select id from public.projects loop
    if not exists (
      select 1 from public.sprints
      where project_id = prj.id and start_date <= wk_end and end_date >= wk_start
    ) then
      insert into public.sprints (name, status, start_date, end_date, project_id)
      values (
        'Sprint tuần ' || pg_catalog.to_char(monday, 'DD/MM')
                       || '–' || pg_catalog.to_char(monday + 6, 'DD/MM'),
        'active', wk_start, wk_end, prj.id
      );
      created := created + 1;
    end if;
  end loop;
  return created;
end;
$$;

revoke execute on function public.ensure_week_sprint() from public, anon, authenticated;

-- Dự án mới tạo giữa tuần: seed luôn sprint tuần hiện tại. AFTER INSERT + hàm idempotent
-- nên tạo nhiều dự án liên tiếp cũng không đẻ trùng.
create or replace function public.projects_seed_week_sprint()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.ensure_week_sprint();
  return new;
end;
$$;
revoke execute on function public.projects_seed_week_sprint() from public, anon, authenticated;

create trigger projects_seed_week_sprint
  after insert on public.projects
  for each row execute function public.projects_seed_week_sprint();

-- Chạy ngay một lượt: dự án nào chưa có sprint tuần này thì có luôn.
select public.ensure_week_sprint();
