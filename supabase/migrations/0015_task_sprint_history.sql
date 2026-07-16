-- Lịch sử sprint của task: một task có thể đi qua nhiều sprint khi chưa làm xong.
-- `tasks.sprint_id` vẫn là sprint HIỆN TẠI (mọi query cũ giữ nguyên); bảng này giữ
-- dấu vết mọi sprint task từng thuộc về, để đếm "task bị đẩy qua mấy sprint".
create table public.task_sprints (
  task_id   uuid not null references public.tasks (id)   on delete cascade,
  sprint_id uuid not null references public.sprints (id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (task_id, sprint_id)
);
create index task_sprints_sprint_idx on public.task_sprints (sprint_id);
alter table public.task_sprints enable row level security;

create policy task_sprints_select on public.task_sprints
  for select to authenticated using (true);
-- Không có policy ghi: chỉ trigger (security definer) được viết vào đây, nên lịch sử
-- không thể bị sửa từ client.

-- Ghi ở tầng DB thay vì tầng app: không đường ghi nào quên được, kể cả bot dùng
-- service-role key.
create or replace function public.log_task_sprint()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sprint_id is not null then
    insert into public.task_sprints (task_id, sprint_id)
    values (new.id, new.sprint_id)
    on conflict do nothing;   -- quay lại sprint cũ không tạo bản ghi trùng
  end if;
  return new;
end;
$$;
revoke execute on function public.log_task_sprint() from public, anon, authenticated;

create trigger tasks_log_sprint after insert or update of sprint_id on public.tasks
  for each row execute function public.log_task_sprint();

-- Backfill: task hiện có coi như chỉ từng ở sprint hiện tại của nó.
-- GIỚI HẠN: task đã bị chuyển sprint TRƯỚC migration này chỉ còn lại sprint cuối —
-- số "bị đẩy N sprint" chỉ chính xác từ thời điểm áp migration trở đi.
insert into public.task_sprints (task_id, sprint_id, added_at)
select id, sprint_id, coalesce(created_at, now())
from public.tasks
where sprint_id is not null
on conflict do nothing;

alter publication supabase_realtime add table public.task_sprints;
