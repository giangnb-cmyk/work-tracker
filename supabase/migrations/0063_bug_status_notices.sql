-- 0063 — Báo lên thread Discord khi có người đổi TRẠNG THÁI bug trên web.
--
-- Hàng đợi (cùng khuôn bug_sync_requests / member_dm_requests): web đổi status → một dòng
-- pending ở đây → bot (service_role) quét mỗi `bug_sync_poll_seconds`, đăng một tin vào
-- đúng thread forum của bug ("<ai> đổi trạng thái: Fixing → Done") rồi đánh dấu done.
--
-- GHI BẰNG TRIGGER, không phải phía client — cùng lý do activity (0007) / task_sprints
-- (0015): tab Bugs đổi status từ HAI đường (kéo thẻ Kanban trong Bugs.tsx và nút trạng
-- thái trong BugModal), thêm đường thứ ba là quên. Trigger thì không đường nào lọt.
--
-- Lọc "đổi từ web" bằng `auth.uid() is not null`: bot dùng service_role nên auth.uid()
-- NULL → lượt sync Discord→app (bot suy status từ tag) KHÔNG sinh thông báo. Thiếu cái
-- chốt này thì bot tự báo về chính thay đổi nó vừa đọc từ Discord — vòng lặp vọng.

create table public.bug_status_notices (
  id           uuid primary key default gen_random_uuid(),
  bug_id       uuid not null references public.bugs (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  -- Chụp lại thread lúc đổi: bug có thể bị gỡ liên kết Discord sau đó, nhưng tin nhắn
  -- vẫn phải đến đúng chỗ nó thuộc về.
  thread_id    text not null,
  from_status  text not null,
  to_status    text not null,
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_name   text not null default '',
  status       text not null default 'pending',   -- pending | done | error | skipped
  result       text not null default '',
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.bug_status_notices enable row level security;
-- Bot quét đúng hàng chờ: index một phía cho các dòng chưa xử lý.
create index bug_status_notices_pending_idx on public.bug_status_notices (created_at)
  where status = 'pending';
create index bug_status_notices_bug_idx on public.bug_status_notices (bug_id);

-- Đọc: mọi user đã đăng nhập (không nhạy cảm — đúng thứ đã hiện trên bảng bug), như
-- bug_sync_requests. KHÔNG có policy insert/update/delete: chỉ trigger SECURITY DEFINER
-- ghi vào, chỉ bot (service_role, bỏ qua RLS) cập nhật kết quả → client không bịa được
-- thông báo giả mạo danh người khác lên Discord.
create policy bug_status_notices_select on public.bug_status_notices
  for select to authenticated using (true);

create or replace function public.log_bug_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  -- Không đổi status / bot đổi (service_role) / bug chưa có thread trên Discord → im lặng.
  if new.status is not distinct from old.status
     or uid is null
     or coalesce(new.discord_thread_id, '') = '' then
    return new;
  end if;

  insert into public.bug_status_notices
    (bug_id, project_id, thread_id, from_status, to_status, actor_id, actor_name)
  values (
    new.id, new.project_id, new.discord_thread_id,
    old.status::text, new.status::text, uid,
    coalesce((select display_name from public.profiles where id = uid), '')
  );
  return new;
end;
$$;
revoke execute on function public.log_bug_status_change() from public, anon, authenticated;

drop trigger if exists bugs_log_status_change on public.bugs;
create trigger bugs_log_status_change after update of status on public.bugs
  for each row execute function public.log_bug_status_change();
