-- 0043: bảng api_keys — khoá truy cập cho APP NGOÀI gọi Edge Function (member-tasks).
--
-- Lưu SHA-256 hex của key, KHÔNG BAO GIỜ lưu key thô. Cố ý KHÔNG tạo policy RLS nào:
-- bật RLS mà không có policy = anon/authenticated bị chặn toàn bộ, chỉ service-role
-- (Edge Function, bot) đọc/ghi được. Thu hồi key = update enabled=false, không cần xoá.

create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,           -- tên app/đối tác đang cầm key
  key_hash     text not null unique,           -- SHA-256 hex (lowercase) của key thô
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz                     -- Edge Function cập nhật mỗi lần gọi
);

alter table public.api_keys enable row level security;
