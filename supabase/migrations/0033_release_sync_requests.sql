-- 0033 — Đồng bộ lịch phát hành từ sheet release: nút "Sync lịch" ở web.
--
-- 0032 thêm feature_labels.release_date nhưng ngày phải nạp bằng tay. Sheet mới là nguồn
-- sự thật của lịch, mà WEB KHÔNG ĐỌC ĐƯỢC Google Sheets: service account chỉ có ở bot
-- (xem drive_gateway). Nên đi đường vòng quen thuộc: web xếp yêu cầu, bot (service-role)
-- rút hàng đợi rồi ghi lại — cùng khuôn với bug_sync_requests (0011) và
-- member_dm_requests (0025).
--
-- release_sheet_id nằm ở projects vì mỗi dự án một sheet release riêng. KHÔNG dùng lại
-- weekly_sheet_id (0022): đó là sheet báo cáo tuần, hai thứ khác nhau, gộp vào là sớm
-- muộn cũng có dự án cần hai sheet khác nhau.

alter table public.projects add column if not exists release_sheet_id text;

comment on column public.projects.release_sheet_id is
  'Id Google Sheet chứa lịch phát hành (tab "Timeline": cột Version | Date). Bot đọc để '
  'điền feature_labels.release_date. NULL = dự án không đồng bộ lịch từ sheet.';

create table if not exists public.release_sync_requests (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  status       text not null default 'pending',   -- pending | done | error
  result       text not null default '',
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.release_sync_requests enable row level security;
create index if not exists release_sync_requests_pending_idx
  on public.release_sync_requests (status, created_at);

-- Admin-only cả hai chiều: sửa lịch phát hành là việc quản trị. Bot rút hàng đợi bằng
-- service-role key nên bypass RLS — không cần policy update.
drop policy if exists release_sync_requests_select on public.release_sync_requests;
create policy release_sync_requests_select on public.release_sync_requests
  for select to authenticated using ( public.is_admin() );

drop policy if exists release_sync_requests_insert on public.release_sync_requests;
create policy release_sync_requests_insert on public.release_sync_requests
  for insert to authenticated with check ( public.is_admin() );

-- Realtime: web hiện kết quả ngay khi bot xử lý xong, khỏi bắt người dùng F5.
alter publication supabase_realtime add table public.release_sync_requests;
