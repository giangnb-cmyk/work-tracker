-- Feature: nhãn (tag) per-project + phân loại delivery/ongoing.
--
-- `feature_labels` copy nguyên pattern `bug_labels` (0010): palette nhãn theo project,
-- đọc cho mọi người đã đăng nhập, ghi admin. Feature gắn nhãn qua `features.label_ids`
-- (uuid[]) — dùng để gom nhóm ("Shop", "Gameplay"…) và lọc ở tab Features.
--
-- `features.kind` tách loại feature:
--   delivery = gói bán / thứ ship được cho user, có ngày xong → UI hiện % hoàn thành.
--   ongoing  = việc chạy liên tục (Polish, Gameplay tuning) — không bao giờ "done",
--              UI KHÔNG hiện % (con số đó vô nghĩa) mà hiện nhịp làm gần đây.

-- ---------------------------------------------------------------------------
-- feature_labels — palette nhãn theo project
-- ---------------------------------------------------------------------------
create table public.feature_labels (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  color       text not null default '#6366f1',
  icon        text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);
alter table public.feature_labels enable row level security;
create index feature_labels_project_idx on public.feature_labels (project_id, name);
create policy feature_labels_select on public.feature_labels for select to authenticated using (true);
create policy feature_labels_write  on public.feature_labels for all to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- useFeatureLabels đăng ký realtime CÓ filter (project_id) và nhãn có thể bị xoá →
-- cần REPLICA IDENTITY FULL để sự kiện DELETE còn cột mà khớp filter (xem 0021).
alter table public.feature_labels replica identity full;
alter publication supabase_realtime add table public.feature_labels;

-- ---------------------------------------------------------------------------
-- features.kind + features.label_ids
-- ---------------------------------------------------------------------------
alter table public.features
  add column kind text not null default 'delivery'
    check (kind in ('delivery', 'ongoing')),
  add column label_ids uuid[] not null default '{}';
