-- Thống kê lượt truy cập web: ai vào bao nhiêu lần, theo tuần/tháng/năm.
--
-- `profiles.last_seen_at` đã có nhưng bị GHI ĐÈ mỗi lần mở app -> chỉ biết lần cuối, không
-- đếm được. Bảng này append-only nên mới dựng lại được lịch sử.
--
-- Một dòng = một PHIÊN mở app (mở tab mới). F5 trong cùng tab KHÔNG đếm lại — web chặn
-- bằng sessionStorage. Cố ý không lưu đường dẫn/tab đang xem: câu hỏi cần trả lời là "ai
-- vào bao nhiêu lần", không phải theo dõi từng thao tác.

create table public.visits (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  at      timestamptz not null default now()
);

alter table public.visits enable row level security;

-- Truy vấn luôn là "gom theo người trong một khoảng thời gian" -> index này phục vụ cả
-- lọc theo khoảng lẫn gom nhóm.
create index visits_at_idx on public.visits (at desc);
create index visits_user_at_idx on public.visits (user_id, at desc);

-- Ghi: chỉ ghi được lượt CỦA CHÍNH MÌNH. Không có policy update/delete -> lịch sử không
-- sửa được từ client, kể cả admin (muốn xoá phải vào Supabase).
create policy visits_insert_own on public.visits for insert to authenticated
  with check ( user_id = (select auth.uid()) );

-- Đọc: CHỈ admin. Đây là dữ liệu theo dõi từng người — khác các bảng khác trong dự án
-- (đều `using (true)`), ở đây cố ý chặt hơn.
create policy visits_select_admin on public.visits for select to authenticated
  using ( public.is_admin() );

comment on table public.visits is
  'Append-only: 1 dòng = 1 phiên mở web. Đọc: admin. Ghi: chính chủ. Dùng cho tab Truy cập.';
