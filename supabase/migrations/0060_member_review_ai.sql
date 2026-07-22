-- Tổng hợp AI theo THÁNG/QUÝ từ member_sprint_notes (0059). Web xếp yêu cầu, bot (service-role)
-- rút hàng đợi, chạy Claude CLI, ghi kết quả — CÙNG khuôn member_dm_requests (0025) /
-- release_sync_requests (0033). Web tính sẵn period_start/period_end nên bot KHÔNG phải làm toán
-- ranh giới tháng/quý; bot chỉ lọc sprint GIAO khoảng đó.

-- (a) Hàng đợi yêu cầu phân tích. Admin-only insert+select (như member_dm_requests).
create table public.member_review_requests (
  id             uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  period_kind    text not null,                  -- 'month' | 'quarter'
  period_start   date not null,                  -- web tính sẵn (1 của tháng/quý)
  period_end     date not null,                  -- ngày cuối kỳ (bao gồm)
  force          boolean not null default false, -- chạy lại dù đã có kết quả
  requested_by   uuid references public.profiles (id) on delete set null,
  status         text not null default 'pending',-- pending | done | error
  result         text not null default '',
  created_at     timestamptz not null default now(),
  processed_at   timestamptz,
  constraint member_review_requests_kind_ck check (period_kind in ('month','quarter'))
);
alter table public.member_review_requests enable row level security;
create index member_review_requests_pending_idx on public.member_review_requests (status, created_at);

create policy member_review_requests_select on public.member_review_requests
  for select to authenticated using ( public.is_admin() );
create policy member_review_requests_insert on public.member_review_requests
  for insert to authenticated with check ( public.is_admin() );
alter publication supabase_realtime add table public.member_review_requests;

-- (b) Kết quả AI (bền, cho hiển thị + idempotency). Bot service-role ghi (bỏ qua RLS); client
-- CHỈ ĐỌC (admin) — không có policy insert/update, giống member_comp_history (0057).
create table public.member_period_reviews (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.profiles (id) on delete cascade,
  period_kind       text not null,
  period_start      date not null,
  period_end        date not null,
  summary           text not null default '',    -- văn bản AI (tiếng Việt, markdown)
  source_note_count int  not null default 0,
  model             text not null default '',
  status            text not null default 'done',-- done | empty (kỳ không có note → khỏi tốn LLM)
  generated_by      uuid references public.profiles (id) on delete set null,
  generated_at      timestamptz not null default now(),
  constraint member_period_reviews_kind_ck check (period_kind in ('month','quarter')),
  constraint member_period_reviews_uniq unique (member_id, period_kind, period_start)
);
alter table public.member_period_reviews enable row level security;
create index member_period_reviews_member_idx on public.member_period_reviews (member_id, period_start desc);

create policy member_period_reviews_select on public.member_period_reviews
  for select to authenticated using ( public.is_admin() );
alter publication supabase_realtime add table public.member_period_reviews;
