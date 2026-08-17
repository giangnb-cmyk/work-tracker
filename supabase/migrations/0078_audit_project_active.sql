-- 1) SỬA LỖI của 0077, 2) ghi việc bật/tắt dự án vào Nhật ký hệ thống.
--
-- ---------------------------------------------------------------------------
-- (1) `projects_stamp_paused_at` ở 0077 có nhánh `else new.paused_at := old.paused_at`
--     nhằm chặn client gửi mốc bậy. Nhưng nó chặn luôn MỌI lệnh ghi hợp lệ vào cột khi
--     `is_active` không đổi — kể cả câu backfill nằm ngay dưới nó trong chính 0077, nên
--     dự án đã tắt từ trước migration vẫn `paused_at = NULL`. Bỏ nhánh đó:
--     PATCH của PostgREST không kèm cột thì Postgres giữ nguyên giá trị cũ sẵn rồi, và
--     chỉ admin mới update được `projects` nên "client gửi mốc bậy" không đáng đánh đổi.
-- ---------------------------------------------------------------------------
create or replace function public.projects_stamp_paused_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.paused_at := case when new.is_active then null else now() end;
  elsif new.is_active is distinct from old.is_active then
    new.paused_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;

-- Đóng dấu cho dự án đã tắt từ trước (giờ mới chạy được). Không biết giờ tắt thật -> now().
-- Câu này KHÔNG đổi is_active nên không kích trigger audit bên dưới, không đẻ log ma.
update public.projects set paused_at = now() where is_active = false and paused_at is null;

-- ---------------------------------------------------------------------------
-- (2) project.active — bật/tắt dự án vào `audit_log`.
--
-- Trigger SECURITY DEFINER, cùng khuôn với 0035: client KHÔNG có policy insert vào
-- audit_log, nên đây là đường duy nhất ghi được -> không ai bịa hay bỏ sót được dòng log.
-- Bot (service_role) tắt dự án bằng SQL cũng vào log, actor = 'Bot'.
--
-- CHỈ bắt UPDATE có đổi `is_active`: mọi lần lưu dự án khác (đổi webhook, sheet, tên…)
-- không được đẻ log, không thì nhật ký thành nhật ký chỉnh tả.
-- ---------------------------------------------------------------------------
create or replace function public.audit_project_active()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_active is not distinct from old.is_active then
    return new;
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id, summary, project_id, meta)
  values ((select auth.uid()), public.audit_actor_name(), 'project.active', 'project', new.id,
    case when new.is_active then 'Bật lại dự án: ' else 'Tạm dừng dự án: ' end
      || coalesce(nullif(new.name, ''), '(không tên)'),
    new.id,
    jsonb_build_object(
      'project_name', new.name,
      'is_active', new.is_active,
      'paused_at', new.paused_at
    ));
  return new;
end;
$$;
revoke execute on function public.audit_project_active() from public, anon, authenticated;

drop trigger if exists projects_audit_active on public.projects;
create trigger projects_audit_active after update on public.projects
  for each row execute function public.audit_project_active();
