-- Mã ngắn cho task -> link chia sẻ gọn (vd /t/aB3xK9) thay cho /tasks/<uuid>?p=<uuid>.
-- URL trong masked link của Discord bị ẩn nhưng VẪN tính vào trần 2000 ký tự/tin, nên rút
-- gọn URL = nhét được nhiều task hơn mỗi tin note họp.
--
-- Đọc theo short_code đã nằm trong policy `tasks_select` (using true) -> KHÔNG cần policy mới.
-- Sinh mã bằng trigger BEFORE INSERT: áp cho CẢ web (authenticated) lẫn bot (service_role)
-- vì trigger chạy bất kể RLS.

-- 1) Hàm sinh mã 6 ký tự base62 DUY NHẤT. SECURITY DEFINER để kiểm trùng thấy MỌI task
--    (không phụ thuộc RLS của người gọi); revoke execute vì chỉ trigger/migration gọi tới.
create or replace function public.gen_task_short_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * 62)::int, 1);
    end loop;
    exit when not exists (select 1 from public.tasks where short_code = code);
  end loop;
  return code;
end;
$$;

revoke execute on function public.gen_task_short_code() from public, anon, authenticated;

-- 2) Cột nullable trước để backfill; backfill TỪNG DÒNG (loop -> mỗi mã thấy mã đã gán trước
--    trong cùng transaction, khỏi trùng); rồi NOT NULL + unique index (cũng là index tra cứu).
alter table public.tasks add column if not exists short_code text;

do $$
declare r record;
begin
  for r in select id from public.tasks where short_code is null loop
    update public.tasks set short_code = public.gen_task_short_code() where id = r.id;
  end loop;
end $$;

alter table public.tasks alter column short_code set not null;
create unique index if not exists tasks_short_code_key on public.tasks (short_code);

-- 3) Trigger tự điền mã lúc tạo task (web = authenticated, bot = service_role đều dính).
create or replace function public.tasks_set_short_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.short_code is null then
    new.short_code := public.gen_task_short_code();
  end if;
  return new;
end;
$$;

revoke execute on function public.tasks_set_short_code() from public, anon, authenticated;

drop trigger if exists tasks_short_code on public.tasks;
create trigger tasks_short_code
  before insert on public.tasks
  for each row execute function public.tasks_set_short_code();
