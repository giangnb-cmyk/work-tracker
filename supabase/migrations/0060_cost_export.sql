-- Xuất bảng chi phí ra Google Sheet — theo pattern queue quen thuộc (release_sync/bug_sync):
-- web KHÔNG gọi được Google API (service account chỉ nằm ở bot), nên web tính sẵn toàn bộ
-- số liệu (engine buildCostSeries) nhét vào `payload`, xếp hàng ở đây; bot chỉ việc GHI.
--
-- Sheet đích cấu hình riêng từng dự án (`projects.cost_sheet_id`) — KHÔNG dùng chung
-- weekly_sheet_id: sheet weekly team xem được, còn bảng chi phí CÓ LƯƠNG, phải là file
-- riêng chỉ share cho admin + service account (Editor).
alter table public.projects add column if not exists cost_sheet_id text;

create table public.cost_export_requests (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  payload      jsonb not null,
  status       text not null default 'pending' check (status in ('pending', 'done', 'error')),
  result       text not null default '',
  requested_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.cost_export_requests enable row level security;
create index cost_export_requests_pending_idx
  on public.cost_export_requests (created_at) where status = 'pending';

-- Admin tạo yêu cầu + đọc trạng thái (payload chứa LƯƠNG). KHÔNG có policy update/delete
-- cho client — chỉ bot (service role, vượt RLS) đánh dấu done/error.
create policy cost_export_requests_select on public.cost_export_requests
  for select to authenticated using ( public.is_admin() );
create policy cost_export_requests_insert on public.cost_export_requests
  for insert to authenticated with check ( public.is_admin() );

-- Realtime để nút "Xuất" trên web thấy trạng thái đổi (không cần poll dày).
alter table public.cost_export_requests replica identity full;
alter publication supabase_realtime add table public.cost_export_requests;
