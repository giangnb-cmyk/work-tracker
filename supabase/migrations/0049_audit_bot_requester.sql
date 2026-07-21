-- 0049 — Bot xoá task: audit log ghi thêm NGƯỜI YÊU CẦU (ai nhờ bot xoá).
--
-- Bot chạy bằng service_role nên trigger 0035 chỉ ghi actor='Bot' — mất dấu người thật.
-- Bot giờ xoá qua RPC bot_delete_task(actor): nó đặt GUC app.bot_actor_* (transaction-local)
-- RỒI mới delete, nên trigger AFTER DELETE (chạy cùng transaction) đọc được và quy trách
-- nhiệm về người yêu cầu, kèm ghi chú 'qua bot'. Web vẫn xoá bằng DELETE thường (RLS) →
-- không đặt GUC → giữ nguyên hành vi cũ (actor = người đăng nhập).

create or replace function public.bot_delete_task(p_task_id uuid, p_actor_id uuid, p_actor_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.bot_actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.bot_actor_name', coalesce(p_actor_name, ''), true);
  delete from public.tasks where id = p_task_id;
end;
$$;
-- Chỉ bot (service_role, bỏ qua RLS) gọi — KHÔNG mở cho client. Web xoá qua DELETE + RLS.
revoke execute on function public.bot_delete_task(uuid, uuid, text) from public, anon, authenticated;

-- Trigger cũ (0035) chỉ đổi phần suy ra actor: có GUC (= xoá qua bot) thì ghi người yêu cầu.
create or replace function public.audit_task_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  bot_id   uuid := nullif(current_setting('app.bot_actor_id', true), '')::uuid;
  bot_name text := nullif(current_setting('app.bot_actor_name', true), '');
  a_id     uuid;
  a_name   text;
  m        jsonb := jsonb_build_object('title', old.title, 'status', old.status::text);
begin
  if bot_id is not null then
    a_id := bot_id;
    a_name := 'Bot · yêu cầu bởi ' || coalesce(nullif(bot_name, ''), '?');
    m := m || jsonb_build_object('via', 'bot', 'requested_by_id', bot_id::text, 'requested_by_name', bot_name);
  else
    a_id := (select auth.uid());
    a_name := public.audit_actor_name();
  end if;
  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id, summary, project_id, meta)
  values (a_id, a_name, 'task.delete', 'task', old.id,
    'Xoá task: ' || coalesce(nullif(old.title, ''), '(không tên)'),
    old.project_id, m);
  return old;
end;
$$;
revoke execute on function public.audit_task_deleted() from public, anon, authenticated;
