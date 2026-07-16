-- Mốc thời điểm bug chuyển sang Done, để tính "bug fix xong trong thời gian sprint".
--
-- Vì sao KHÔNG dùng bugs.updated_at: trigger `bugs_touch_updated_at` (0010) dập
-- updated_at ở MỌI lần UPDATE, mà bug_sync._upsert_bugs lại `update(patch)` cho TỪNG bug
-- ở MỌI lần sync (9h hằng ngày, vô điều kiện — nó không so sánh xem có gì đổi không).
-- Nên updated_at = "lần sync gần nhất", không phải "lúc done": mọi bug done sẽ rơi vào
-- sprint đang chạy, và rơi lại ở mọi sprint sau, mãi mãi.
--
-- Ghi ở tầng DB chứ không tầng app (cùng lý do với task_sprints ở 0015): web, bot dùng
-- service-role, và sync forum — không đường ghi nào quên được.

alter table public.bugs add column if not exists done_at timestamptz;

-- Bất biến: done_at IS NOT NULL  <=>  status = 'done'. Mở lại bug thì xoá mốc cũ.
create or replace function public.touch_bug_done_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Bug sinh ra đã mang tag Done sẵn từ forum: mốc = lúc sync NHÌN THẤY nó done.
    if new.status = 'done' then
      new.done_at := now();
    end if;
    return new;
  end if;

  if new.status = 'done' and old.status is distinct from 'done' then
    new.done_at := now();
  elsif new.status <> 'done' then
    new.done_at := null;   -- Re-open: không còn done thì không giữ mốc done
  end if;
  return new;
end;
$$;

-- Chỉ chạy như trigger; không client nào được gọi qua RPC (trigger vẫn nổ mà không cần EXECUTE).
revoke execute on function public.touch_bug_done_at() from public, anon, authenticated;

create trigger bugs_touch_done_at before insert or update on public.bugs
  for each row execute function public.touch_bug_done_at();

-- Truy vấn chính: bug của 1 project, done_at nằm trong khoảng ngày của sprint.
create index if not exists bugs_done_at_idx
  on public.bugs (project_id, done_at)
  where done_at is not null;

-- CỐ Ý KHÔNG backfill 80 bug đang done: không có nguồn nào biết chúng done lúc nào
-- (updated_at đã bị sync dập). Để NULL = không tính vào sprint nào, và nói rõ trong
-- CAVEATS — giống hệt cách "bị đẩy N sprint" chỉ đếm từ khi bật lịch sử sprint.
