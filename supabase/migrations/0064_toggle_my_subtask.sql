-- 0064 — Cho phép NGƯỜI ĐƯỢC GIAO SUBTASK tick/bỏ tick đúng subtask của mình.
--
-- Vấn đề: subtask giao chéo (task của A, subtask giao cho B) là chuyện thường, và mục
-- "Subtask của tôi" ở tab Task của tôi hiện đúng những subtask đó. Nhưng RLS `tasks_update`
-- (0002) chỉ cho admin / reporter / assignee CỦA TASK ghi, nên B bấm vào ô tick là im ru
-- không có gì xảy ra — nhìn như hỏng.
--
-- KHÔNG nới `tasks_update`: RLS là theo HÀNG chứ không theo cột, nên thêm "ai giữ subtask
-- cũng được update" là mở luôn cho họ sửa tiêu đề/hạn/sprint của task người khác. Thay vào
-- đó là một hàm HẸP: chỉ lật đúng cờ `done` của ĐÚNG subtask mà người gọi đang giữ, không
-- đụng bất kỳ cột nào khác, không đụng subtask nào khác.

create or replace function public.toggle_my_subtask(
  p_task_id uuid,
  p_subtask_id text,
  p_done boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  mine boolean;
  next_subtasks jsonb;
begin
  if uid is null then
    return false;   -- service_role/anon: không có "của tôi" để mà lật
  end if;

  -- Chỉ lật khi subtask này THẬT SỰ đang giao cho người gọi. Kiểm tra trước, tách khỏi
  -- câu update, để "không có quyền" và "task không tồn tại" đều trả về false gọn ghẽ.
  select exists (
    select 1
    from public.tasks t,
         lateral jsonb_array_elements(t.subtasks) e
    where t.id = p_task_id
      and e ->> 'id' = p_subtask_id
      and e ->> 'assigneeId' = uid::text
  ) into mine;
  if not mine then
    return false;
  end if;

  -- Dựng lại mảng, GIỮ NGUYÊN THỨ TỰ (`with ordinality` + `order by`): jsonb_agg không
  -- bảo đảm thứ tự, mà checklist đảo lộn sau mỗi lần tick thì người dùng thấy ngay.
  select jsonb_agg(
           case when e ->> 'id' = p_subtask_id
                then jsonb_set(e, '{done}', to_jsonb(p_done))
                else e end
           order by ord
         )
    into next_subtasks
  from public.tasks t,
       lateral jsonb_array_elements(t.subtasks) with ordinality as a(e, ord)
  where t.id = p_task_id;

  update public.tasks set subtasks = coalesce(next_subtasks, '[]'::jsonb)
  where id = p_task_id;
  return true;
end;
$$;

-- Hàm này CỐ Ý cho client gọi (khác các SECURITY DEFINER khác trong repo): cổng bảo vệ nằm
-- ngay trong thân hàm — người gọi chỉ lật được subtask mang assigneeId chính họ.
revoke execute on function public.toggle_my_subtask(uuid, text, boolean) from public, anon;
grant execute on function public.toggle_my_subtask(uuid, text, boolean) to authenticated;
