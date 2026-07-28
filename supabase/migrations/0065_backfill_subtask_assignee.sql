-- 0065 — Gán người cho subtask CŨ: lấy người nhận của task cha.
--
-- Trước khi subtask có `assigneeId` (xem 0064 + DATA_MODEL), subtask ngầm hiểu là việc của
-- người nhận task — nên đây là điền đúng cái nghĩa vốn có, không phải đoán bừa. Không
-- backfill thì mục "Subtask của tôi" (Task của tôi) và cột Subtask ở Thống kê trống trơn
-- với toàn bộ dữ liệu cũ, nhìn như tính năng hỏng.
--
-- CHỈ THÊM, không ghi đè: `where` bỏ qua subtask đã có người, và bỏ qua task chưa giao ai
-- (không có gì để suy ra). Chạy lại lần nữa cũng không đổi gì thêm (idempotent).
--
-- Tác dụng phụ: `updated_at` của các task được sửa sẽ nhảy lên (trigger). Không sinh dòng
-- nào trong `activity` — trigger ở đó chỉ bắt đổi status/sprint_id.

update public.tasks t
set subtasks = (
  select jsonb_agg(
           case
             when nullif(e ->> 'assigneeId', '') is null
               then e || jsonb_build_object(
                      'assigneeId', t.assignee_id::text,
                      'assigneeName', coalesce(t.assignee_name, ''))
             else e
           end
           -- Giữ nguyên thứ tự checklist: jsonb_agg không bảo đảm thứ tự.
           order by ord
         )
  from jsonb_array_elements(t.subtasks) with ordinality as a(e, ord)
)
where t.assignee_id is not null
  and jsonb_array_length(t.subtasks) > 0
  and exists (
    select 1
    from jsonb_array_elements(t.subtasks) e2
    where nullif(e2 ->> 'assigneeId', '') is null
  );
