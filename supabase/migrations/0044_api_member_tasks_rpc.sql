-- 0044: RPC api_member_tasks — gộp TOÀN BỘ logic của Edge Function member-tasks
-- (check api_key → tìm nhân sự → lấy task kèm project/feature/sprint) vào MỘT lượt
-- gọi DB, thay cho 3 query tuần tự qua PostgREST — mỗi query là một round-trip
-- edge↔DB nên gộp lại giảm hẳn độ trễ.
--
-- Nhận HASH của key (SHA-256 hex, tính ở Edge Function) chứ không nhận key thô,
-- để key không lọt vào log câu lệnh SQL.
--
-- SECURITY DEFINER + revoke: chỉ service_role (Edge Function) gọi được — anon /
-- authenticated bị thu quyền theo đúng luật CLAUDE.md.

create or replace function public.api_member_tasks(
  p_key_hash   text,
  p_email      text  default null,
  p_user_id    uuid  default null,
  p_discord_id text  default null,
  p_statuses   text[] default array['todo','in_progress','review'],
  p_project_id uuid  default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_id uuid;
  v_member public.profiles%rowtype;
  v_tasks  jsonb;
begin
  select id into v_key_id
    from public.api_keys
   where key_hash = p_key_hash and enabled;
  if v_key_id is null then
    return jsonb_build_object('error', 'unauthorized');
  end if;
  update public.api_keys set last_used_at = now() where id = v_key_id;

  select * into v_member
    from public.profiles p
   where (p_user_id    is not null and p.id = p_user_id)
      or (p_email      is not null and lower(p.email) = lower(p_email))
      or (p_discord_id is not null and p.discord_id = p_discord_id)
   limit 1;
  if v_member.id is null then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  -- Sắp: việc đang chạy trước (in_progress → review → todo → done), rồi hạn chót gần nhất.
  select coalesce(jsonb_agg(t.task order by t.rank, t.due_key), '[]'::jsonb)
    into v_tasks
    from (
      select
        case tk.status::text
          when 'in_progress' then 0 when 'review' then 1 when 'todo' then 2 else 3
        end as rank,
        coalesce(tk.due_date, 'infinity'::timestamptz) as due_key,
        jsonb_build_object(
          'id',          tk.id,
          'shortCode',   tk.short_code,
          'title',       tk.title,
          'description', tk.description,
          'status',      tk.status::text,
          'priority',    tk.priority::text,
          'points',      tk.points,
          'tags',        to_jsonb(tk.tags),
          'project', case when tk.project_id is null then null
            else jsonb_build_object('id', tk.project_id, 'name', coalesce(pr.name, '')) end,
          'feature', case when tk.feature_id is null then null
            else jsonb_build_object('id', tk.feature_id, 'name', coalesce(f.name, '')) end,
          'sprint', case when tk.sprint_id is null then null
            else jsonb_build_object('id', tk.sprint_id, 'name', coalesce(s.name, ''),
                                    'status', coalesce(s.status::text, '')) end,
          'dueStart',    tk.due_start,
          'dueDate',     tk.due_date,
          'overdue',     (tk.status <> 'done' and tk.due_date is not null and tk.due_date < now()),
          'subtasks', jsonb_build_object(
            'done', (select count(*) from jsonb_array_elements(tk.subtasks) st
                      where coalesce((st->>'done')::boolean, false)),
            'total', jsonb_array_length(tk.subtasks)
          ),
          'createdAt',   tk.created_at,
          'updatedAt',   tk.updated_at
        ) as task
      from public.tasks tk
      left join public.projects pr on pr.id = tk.project_id
      left join public.features f  on f.id  = tk.feature_id
      left join public.sprints  s  on s.id  = tk.sprint_id
      where tk.assignee_id = v_member.id
        and tk.status::text = any(p_statuses)
        and (p_project_id is null or tk.project_id = p_project_id)
    ) t;

  return jsonb_build_object(
    'member', jsonb_build_object(
      'id',          v_member.id,
      'email',       v_member.email,
      'displayName', v_member.display_name,
      'photoUrl',    v_member.photo_url,
      'jobRole',     v_member.job_role,
      'discordId',   v_member.discord_id
    ),
    'statusFilter', to_jsonb(p_statuses),
    'count',        jsonb_array_length(v_tasks),
    'tasks',        v_tasks
  );
end;
$$;

revoke execute on function public.api_member_tasks(text, text, uuid, text, text[], uuid)
  from public, anon, authenticated;
