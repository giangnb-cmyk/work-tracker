-- Dữ liệu nền cho trang Hiệu suất: mỗi task một dòng gồm lịch sử sprint đã đi qua và
-- các mốc thời gian trạng thái.
--
-- Vì sao là RPC chứ không select thẳng: một dự án vài trăm task sinh vài nghìn dòng
-- `activity`, mà PostgREST cắt ở 1000 dòng KHÔNG báo lỗi — trang này dùng để đánh giá
-- con người nên một mảng bị cắt âm thầm là kiểu sai tệ nhất. Gộp ở đây trả đúng một
-- dòng mỗi task, cùng trần với các query task sẵn có.
--
-- Scope theo project chứ không theo khoảng sprint: đếm "task trễ mấy sprint" cần TOÀN BỘ
-- lịch sử của task, kể cả sprint nằm ngoài khoảng đang xem. Đổi khoảng không phải tải lại.
--
-- Hai nhánh gộp riêng rồi mới join: nếu join thẳng activity với task_sprints sẽ ra tích
-- Descartes (3 sprint × 5 activity = 15 dòng) và array_agg sẽ nhân bản sprint id.
--
-- security invoker (mặc định) → RLS của người gọi vẫn được áp dụng.
-- min(...) filter (where body = 'done') = lần xong ĐẦU TIÊN: task bị mở lại rồi xong lại
-- vẫn tính mốc lần đầu ship được.
create or replace function public.task_report(p_project_id uuid)
returns table (
  task_id              uuid,
  sprint_ids           uuid[],
  first_in_progress_at timestamptz,
  first_done_at        timestamptz
)
language sql stable set search_path = '' as $$
  with hist as (
    select ts.task_id, array_agg(ts.sprint_id order by ts.added_at) as sprint_ids
    from public.task_sprints ts
    join public.tasks t on t.id = ts.task_id
    where t.project_id = p_project_id
    group by ts.task_id
  ),
  cyc as (
    select a.task_id,
           min(a.created_at) filter (where a.body = 'in_progress') as first_in_progress_at,
           min(a.created_at) filter (where a.body = 'done')        as first_done_at
    from public.activity a
    join public.tasks t on t.id = a.task_id
    where a.type = 'status_change' and t.project_id = p_project_id
    group by a.task_id
  )
  select coalesce(h.task_id, c.task_id),
         coalesce(h.sprint_ids, '{}'),
         c.first_in_progress_at,
         c.first_done_at
  from hist h
  full outer join cyc c on c.task_id = h.task_id;
$$;
revoke execute on function public.task_report(uuid) from public, anon;
grant  execute on function public.task_report(uuid) to authenticated;
