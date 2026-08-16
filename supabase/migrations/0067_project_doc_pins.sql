-- 0067 — Ghim tài liệu lên đầu thư viện, RIÊNG TỪNG NGƯỜI.
--
-- Vì sao bảng riêng chứ không thêm cột `pinned` vào `project_docs`: ghim là sở thích CÁ
-- NHÂN ("tài liệu tôi hay dùng"), một cột trên hàng tài liệu là ghim dùng chung — một
-- người ghim thì cả đội thấy đảo thứ tự.
--
-- Bảng N-N thuần, không id riêng: khoá chính là cặp (user_id, doc_id) nên ghim hai lần
-- không sinh dòng trùng, và bỏ ghim = delete theo đúng cặp đó.

create table public.project_doc_pins (
  user_id   uuid not null references public.profiles (id)     on delete cascade,
  doc_id    uuid not null references public.project_docs (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (user_id, doc_id)
);

-- Đường đọc duy nhất là "ghim của TÔI" (user_id = auth.uid()), nên index theo user.
create index project_doc_pins_user_idx on public.project_doc_pins (user_id);

alter table public.project_doc_pins enable row level security;

-- RLS: CHỈ ghim của chính mình — cả ĐỌC lẫn GHI. Chặt hơn phần còn lại của thư viện
-- (project_docs mở đọc cho mọi người) vì đây là dữ liệu cá nhân: người khác không cần
-- biết tôi hay mở tài liệu nào, và càng không được sửa danh sách của tôi.
create policy project_doc_pins_select on public.project_doc_pins
  for select to authenticated using (user_id = (select auth.uid()));

create policy project_doc_pins_insert on public.project_doc_pins
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy project_doc_pins_delete on public.project_doc_pins
  for delete to authenticated using (user_id = (select auth.uid()));

-- Không có policy UPDATE: ghim chỉ có/không, sửa `pinned_at` không mang nghĩa gì.

-- Realtime + replica identity full: event DELETE (bỏ ghim) phải mang đủ cột để client lọc.
alter publication supabase_realtime add table public.project_doc_pins;
alter table public.project_doc_pins replica identity full;
