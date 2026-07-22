-- Đánh giá thành viên theo SPRINT — ghi chú có cấu trúc cho từng người mỗi tuần
-- (Tổng quan / Điểm nổi bật / Điểm cần lưu ý + mức 1..5). Hiện ở tab "Đánh giá" (admin)
-- và tab "Ghi chú" trong chi tiết thành viên (MemberModal).
--
-- Vì sao TÁCH bảng riêng + admin-only: đây là ĐÁNH GIÁ của quản lý về cấp dưới — nhạy cảm y
-- như lương. Bám đúng khuôn member_compensation (0054): RLS admin-only cho CẢ ĐỌC lẫn GHI
-- (is_admin() đã bao owner), member gọi vào nhận rỗng (không lỗi).
--
-- MỘT dòng cho mỗi (member, sprint): ghi chú DÙNG CHUNG, nhiều admin cùng biên tập, sửa-đè
-- (updated_by = người sửa cuối). KHÔNG per-author, KHÔNG lưu author gốc: upsert onConflict ghi
-- đè mọi cột nên "người tạo đầu" không giữ được nếu không có trigger — thừa cho team nhỏ, và
-- AI tổng hợp (0060) cần tập ghi chú sạch, mỗi tuần một dòng.
create table public.member_sprint_notes (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles (id) on delete cascade,
  sprint_id   uuid not null references public.sprints (id)  on delete cascade,
  overview    text not null default '',        -- Tổng quan ("tuần này thế nào")
  highlights  text not null default '',        -- Điểm nổi bật
  concerns    text not null default '',        -- Điểm cần lưu ý
  rating      smallint,                         -- 1..5, null = chưa chấm
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,  -- người sửa cuối
  created_at  timestamptz not null default now(),
  constraint member_sprint_notes_rating_ck check (rating is null or rating between 1 and 5),
  constraint member_sprint_notes_uniq unique (member_id, sprint_id)     -- khoá upsert
);
alter table public.member_sprint_notes enable row level security;
create index member_sprint_notes_member_idx on public.member_sprint_notes (member_id, created_at desc);
create index member_sprint_notes_sprint_idx on public.member_sprint_notes (sprint_id);

-- Admin-only CẢ đọc lẫn ghi (is_admin() bao owner) — copy nguyên 4 policy từ member_compensation.
create policy member_sprint_notes_select on public.member_sprint_notes
  for select to authenticated using ( public.is_admin() );
create policy member_sprint_notes_insert on public.member_sprint_notes
  for insert to authenticated with check ( public.is_admin() );
create policy member_sprint_notes_update on public.member_sprint_notes
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy member_sprint_notes_delete on public.member_sprint_notes
  for delete to authenticated using ( public.is_admin() );

-- Realtime (replica identity full để event DELETE mang đủ cột cho tab live — như 0054).
alter table public.member_sprint_notes replica identity full;
alter publication supabase_realtime add table public.member_sprint_notes;
