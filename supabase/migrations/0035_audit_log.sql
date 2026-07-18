-- 0035 — Nhật ký hệ thống (audit log). Ghi các hành động quản trị mà `activity`
-- (per-task, cascade khi xoá task) KHÔNG giữ được: ai XOÁ task, ai TẠO feature, ai
-- ĐỔI vai trò/quyền lẻ của member.
--
-- Ghi bằng trigger SECURITY DEFINER — cùng kiểu log_task_created (0007). Trigger là
-- bắt buộc chứ không phải cho tiện: (1) bắt được tiêu đề task NGAY lúc xoá, sau đó hàng
-- không còn để tra; (2) không giả mạo/bỏ sót được như ghi phía client; (3) bot
-- (service_role, bypass RLS) làm gì cũng vào log với actor = 'Bot'.
-- Phụ thuộc 0034: trigger member đọc cột profiles.perms — áp 0034 TRƯỚC 0035.

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text not null default '',
  action      text not null,               -- task.delete | feature.create | member.perms
  entity_type text not null default '',    -- task | feature | member
  entity_id   uuid,                        -- id đối tượng (có thể đã bị xoá, vd task)
  summary     text not null default '',    -- câu tiếng Việt hiện thẳng ở UI
  project_id  uuid references public.projects (id) on delete set null,
  meta        jsonb not null default '{}', -- chi tiết có cấu trúc (perms cũ/mới, tiêu đề…)
  created_at  timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_action_idx  on public.audit_log (action);

-- Chỉ admin đọc (như visits, 0023). KHÔNG có policy insert/update/delete: chỉ trigger
-- (SECURITY DEFINER = chủ bảng, bỏ qua RLS) ghi được → client không tự bịa dòng log.
create policy audit_log_select on public.audit_log for select to authenticated
  using ( public.is_admin() );

-- Tên người thực hiện: service_role (bot) → 'Bot'; còn lại lấy display_name của họ.
create or replace function public.audit_actor_name()
returns text language sql security definer set search_path = '' stable as $$
  select case
    when coalesce(auth.jwt() ->> 'role', '') = 'service_role' then 'Bot'
    else coalesce((select display_name from public.profiles where id = (select auth.uid())), '')
  end;
$$;
revoke execute on function public.audit_actor_name() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- task.delete — phải bắt trong trigger DELETE: sau đó hàng task không còn để tra tiêu đề.
-- ---------------------------------------------------------------------------
create or replace function public.audit_task_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id, summary, project_id, meta)
  values ((select auth.uid()), public.audit_actor_name(), 'task.delete', 'task', old.id,
    'Xoá task: ' || coalesce(nullif(old.title, ''), '(không tên)'),
    old.project_id,
    jsonb_build_object('title', old.title, 'status', old.status::text));
  return old;
end;
$$;
revoke execute on function public.audit_task_deleted() from public, anon, authenticated;
drop trigger if exists tasks_audit_deleted on public.tasks;
create trigger tasks_audit_deleted after delete on public.tasks
  for each row execute function public.audit_task_deleted();

-- ---------------------------------------------------------------------------
-- feature.create
-- ---------------------------------------------------------------------------
create or replace function public.audit_feature_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id, summary, project_id, meta)
  values ((select auth.uid()), public.audit_actor_name(), 'feature.create', 'feature', new.id,
    'Tạo feature: ' || coalesce(nullif(new.name, ''), '(không tên)'),
    new.project_id,
    jsonb_build_object('name', new.name));
  return new;
end;
$$;
revoke execute on function public.audit_feature_created() from public, anon, authenticated;
drop trigger if exists features_audit_created on public.features;
create trigger features_audit_created after insert on public.features
  for each row execute function public.audit_feature_created();

-- ---------------------------------------------------------------------------
-- member.perms — đổi vai trò HOẶC quyền lẻ (0034). Chạy cả INSERT (admin tạo member
-- kèm quyền/role) lẫn UPDATE. Bỏ qua lượt tự tạo hồ sơ lúc đăng nhập (role=member,
-- perms rỗng) và mọi update KHÔNG đụng role/perms (ghi presence, đổi tên/Discord…).
-- ---------------------------------------------------------------------------
create or replace function public.audit_member_perms()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  changed boolean;
begin
  if tg_op = 'INSERT' then
    changed := (new.role <> 'member') or (coalesce(new.perms, '{}') <> '{}');
  else
    changed := (new.role is distinct from old.role) or (new.perms is distinct from old.perms);
  end if;
  if not changed then
    return new;
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id, summary, meta)
  values ((select auth.uid()), public.audit_actor_name(), 'member.perms', 'member', new.id,
    'Cập nhật quyền: ' || coalesce(nullif(new.display_name, ''), nullif(new.email, ''), '(không tên)'),
    jsonb_build_object(
      'member_name', coalesce(nullif(new.display_name, ''), new.email),
      'role_old',  case when tg_op = 'UPDATE' then old.role::text else null end,
      'role_new',  new.role::text,
      'perms_old', case when tg_op = 'UPDATE' then to_jsonb(old.perms) else null end,
      'perms_new', to_jsonb(new.perms)
    ));
  return new;
end;
$$;
revoke execute on function public.audit_member_perms() from public, anon, authenticated;
drop trigger if exists profiles_audit_perms on public.profiles;
create trigger profiles_audit_perms after insert or update on public.profiles
  for each row execute function public.audit_member_perms();

alter publication supabase_realtime add table public.audit_log;
