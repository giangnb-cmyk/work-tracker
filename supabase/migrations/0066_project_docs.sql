-- 0066 — Thư viện tài liệu của DỰ ÁN: danh sách link tài liệu dùng chung, gắn được vào
-- feature và task thay vì mỗi lần lại đi dán URL.
--
-- KHÁC HẲN bảng `documents` (0014…0050): bảng đó là store RAG (chunk + embedding bge-m3)
-- cho doc search của bot, không phải danh mục người dùng tự quản. Cố ý tách chứ không
-- nhồi thêm cột vào đó: một bên là chỉ mục máy sinh, một bên là thư viện người curate.
--
-- Vẫn giữ `attachments` jsonb trên tasks/features làm nguồn sự thật của "task này đính
-- kèm gì" — thư viện chỉ là chỗ CHỌN ra rồi copy vào. Nếu trỏ bằng FK thì xoá một mục
-- trong thư viện sẽ làm rỗng tài liệu của hàng loạt task cũ.

create table public.project_docs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 160),
  url         text not null check (url ~* '^https?://'),
  -- Suy từ URL ở web (lib/attachments.detectProvider) rồi lưu lại để lọc/hiện icon mà
  -- không phải phân tích URL ở mọi chỗ đọc.
  provider    text not null default 'link',
  description text not null default '',
  -- Nhóm TỰ DO (GDD, Art, Kỹ thuật…): chuỗi thường chứ không bảng nhãn riêng — thư viện
  -- một dự án chỉ tầm vài chục mục, dựng cả bảng palette cho nó là quá tay.
  category    text not null default '',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);

create index project_docs_project_idx on public.project_docs (project_id);
-- Cùng một link dán hai lần trong một dự án là rác, không phải chủ đích.
create unique index project_docs_project_url_key on public.project_docs (project_id, url);

alter table public.project_docs enable row level security;

-- Đọc: mọi người đã đăng nhập (thư viện tài liệu không nhạy cảm, y như bug_labels).
create policy project_docs_select on public.project_docs
  for select to authenticated using (true);

-- Thêm: MỞ cho mọi người đã đăng nhập — gương với `tasks_insert`. Thư viện chỉ hữu ích khi
-- ai tìm ra tài liệu cũng bỏ vào được; khoá admin thì nó chết dần. `created_by` bị ép đúng
-- người gọi để không mạo danh người khác.
create policy project_docs_insert on public.project_docs
  for insert to authenticated
  with check (created_by = (select auth.uid()));

-- Sửa/xoá: admin (đã bao owner) HOẶC chính người đã thêm — cùng luật với bug do mình báo.
create policy project_docs_update on public.project_docs
  for update to authenticated
  using (public.is_admin() or created_by = (select auth.uid()))
  with check (public.is_admin() or created_by = (select auth.uid()));

create policy project_docs_delete on public.project_docs
  for delete to authenticated
  using (public.is_admin() or created_by = (select auth.uid()));

-- Realtime + replica identity full: event DELETE phải mang đủ cột cho bộ lọc project_id.
alter publication supabase_realtime add table public.project_docs;
alter table public.project_docs replica identity full;
