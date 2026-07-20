-- 0040 — Thêm 'vfx_artist' và 'qa' vào enum job_role.
--
-- job_role là ENUM (không phải text tự do như tưởng lúc thêm hai vị trí này ở web) — nên
-- JOB_ROLES trong types.ts có 'vfx_artist'/'qa' mà enum DB thì chưa, và mọi lần lưu member
-- với hai vị trí đó bị Postgres ném 22P02 'invalid input value for enum'. Lỗi đó lại rơi
-- vào nhánh "Lưu thất bại. Cần quyền admin." của MemberModal -> nhìn như lỗi quyền, thực
-- ra là thiếu giá trị enum.
--
-- ADD VALUE nối vào CUỐI enum, đúng thứ tự JOB_ROLES (…animator, vfx_artist, qa).
-- IF NOT EXISTS để chạy lại không lỗi. Chỉ THÊM giá trị, không dùng ngay trong migration
-- nên chạy trong transaction của Supabase vẫn an toàn (PG12+).

alter type public.job_role add value if not exists 'vfx_artist';
alter type public.job_role add value if not exists 'qa';
