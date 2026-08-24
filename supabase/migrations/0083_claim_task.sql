-- 0083 — Nút "Nhận task": tự gán task CHƯA GIAO cho chính mình từ Bảng Sprint.
--
-- Vấn đề: RLS tasks_update (0074) chỉ cho task.edit_any / reporter / assignee ghi — member
-- không có quyền đó bấm nhận một task trống là bị chặn im lặng. KHÔNG nới tasks_update:
-- nới theo hàng là mở luôn quyền sửa tiêu đề/hạn/sprint của task người khác. Thay vào đó
-- một hàm HẸP (cùng học thuyết 0064): chỉ gán CHÍNH NGƯỜI GỌI vào task đang TRỐNG, không
-- đụng bất kỳ cột nào khác.
--
-- Chống giẫm chân: UPDATE điều kiện `assignee_id is null` là atomic — hai người bấm cùng
-- lúc thì người sau khớp 0 hàng và nhận lại TÊN người đã nhận trước, không lặng lẽ ghi đè.
--
-- Trả jsonb khoá camelCase có chủ đích: kết quả đi thẳng vào UI, không qua mappers.ts.

create or replace function public.claim_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  my_name text;
  holder text;
begin
  if uid is null then
    -- service_role/anon: không có "mình" để mà gán.
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Tên hiển thị đi kèm assignee_id (cột denormalize assignee_name). Hồ sơ nào cũng có
  -- display_name từ Google; lỡ trống thì lùi về phần trước @ của email chứ không ghi rỗng
  -- (rỗng thì list lại hiện "Chưa giao" dù task đã có người).
  select coalesce(nullif(display_name, ''), split_part(email, '@', 1))
    into my_name
  from public.profiles
  where id = uid;
  if my_name is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.tasks
     set assignee_id = uid, assignee_name = my_name
   where id = p_task_id and assignee_id is null;

  if found then
    return jsonb_build_object('ok', true);
  end if;

  select assignee_name into holder from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'taken', 'assigneeName', holder);
end;
$$;

-- Cùng học thuyết 0064: SECURITY DEFINER cho client gọi được, cổng bảo vệ nằm ngay trong
-- thân hàm — người gọi chỉ gán được CHÍNH MÌNH, và chỉ vào task còn trống.
revoke execute on function public.claim_task(uuid) from public, anon;
grant execute on function public.claim_task(uuid) to authenticated;
