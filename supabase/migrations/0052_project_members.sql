-- project_members: WHO is on a project. Trước đây "thành viên của dự án" chỉ suy ra
-- gián tiếp từ task; giờ là danh sách TƯỜNG MINH — admin chọn người (từ roster toàn web)
-- để cho vào dự án. Roster toàn bộ vẫn ở `profiles`; bảng này chỉ là quan hệ N-N.
--
-- RLS soi gương features/projects: đọc mở cho mọi người đã đăng nhập (roster dự án không
-- nhạy cảm), ghi chỉ admin/owner (is_admin() đã bao owner).
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  added_at   timestamptz not null default now(),
  added_by   uuid references public.profiles (id) on delete set null,
  primary key (project_id, user_id)
);
alter table public.project_members enable row level security;
-- Tra ngược "user này ở những dự án nào" (project_id đã là tiền tố PK nên chiều xuôi có index).
create index project_members_user_idx on public.project_members (user_id);

create policy project_members_select on public.project_members
  for select to authenticated using (true);
create policy project_members_insert on public.project_members
  for insert to authenticated with check ( public.is_admin() );
create policy project_members_delete on public.project_members
  for delete to authenticated using ( public.is_admin() );

-- Realtime cho tab Thành viên dự án. REPLICA IDENTITY FULL để event DELETE mang đủ cột cũ
-- cho bộ lọc realtime (project_id=eq.<id>) khớp — cùng lý do migration 0021.
alter table public.project_members replica identity full;
alter publication supabase_realtime add table public.project_members;

-- Backfill: dự án đang chạy không nên trống trơn. Gieo mỗi dự án bằng tất cả những người
-- đã dính tới task của nó (người nhận + người tạo + người theo dõi), miễn là còn hồ sơ thật.
insert into public.project_members (project_id, user_id)
select distinct t.project_id, u.id
from public.tasks t
cross join lateral (
  select t.assignee_id as id
  union
  select t.reporter_id
  union
  select unnest(t.watcher_ids)
) u
where t.project_id is not null
  and u.id is not null
  and exists (select 1 from public.profiles pr where pr.id = u.id)
on conflict do nothing;
