-- 0029 — Sửa bình luận của CHÍNH MÌNH trong nhật ký hoạt động (gõ sai thì sửa lại được).
--
-- activity (0002) mới chỉ có policy select + insert. Không có policy UPDATE nào nghĩa là
-- RLS chặn sạch mọi lần sửa — nên đây phải là migration, không sửa mỗi UI được.
--
-- Mở đúng MỘT khe, bằng hai lớp lo hai việc khác nhau (không lớp nào thay được lớp kia):
--   - RLS activity_update: được nhắm vào hàng nào (bình luận của chính mình, KHÔNG phải
--     sự kiện hệ thống 'created'/'status_change'), và hàng sau khi sửa vẫn phải là bình
--     luận của chính mình — chặn việc biến bình luận thành sự kiện hệ thống hay đổi chủ.
--   - trigger activity_guard_edit: WITH CHECK chỉ nhìn hàng MỚI, không so được với hàng
--     CŨ, nên nó không ngăn nổi việc dời bình luận sang task khác hay sửa mốc tạo cho ra
--     vẻ nói trước. Trigger ghim mọi cột trừ `body` về giá trị cũ (cùng lý do với 0024).
--
-- CỐ Ý không có nhánh bỏ qua cho service_role như 0024: ở đó bot thật sự cần sửa story
-- point, còn ở đây không có thứ gì hợp lệ sửa hàng activity ngoài chính tác giả sửa lỗi
-- gõ — nên bot cũng chịu chung luật ghim cột.

alter table public.activity add column if not exists edited_at timestamptz;

comment on column public.activity.edited_at is
  'Mốc sửa nội dung gần nhất; NULL = chưa sửa lần nào. Do trigger tự điền — không tin client.';

drop policy if exists activity_update on public.activity;
create policy activity_update on public.activity
  for update to authenticated
  using (type = 'comment' and actor_id = (select auth.uid()))
  with check (type = 'comment' and actor_id = (select auth.uid()));

create or replace function public.activity_guard_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Chỉ NỘI DUNG được đổi. Ghim phần còn lại về giá trị cũ thay vì raise: client hợp lệ
  -- không bao giờ gửi các cột này lên, nên im lặng giữ nguyên là fail-closed và không
  -- làm hỏng lần sửa lành tính nào.
  new.id := old.id;
  new.task_id := old.task_id;
  new.actor_id := old.actor_id;
  new.actor_name := old.actor_name;
  new.type := old.type;
  new.created_at := old.created_at;
  -- Mốc sửa do DB đặt. Đổi qua lại rồi về đúng nội dung cũ thì không tính là đã sửa.
  new.edited_at := case
    when new.body is distinct from old.body then pg_catalog.now()
    else old.edited_at
  end;
  return new;
end;
$$;

-- Trigger vẫn chạy dù không có execute — revoke chỉ là vệ sinh, chặn gọi tay (như 0024).
revoke execute on function public.activity_guard_edit() from public, anon, authenticated;

drop trigger if exists activity_guard_edit on public.activity;
create trigger activity_guard_edit
  before update on public.activity
  for each row execute function public.activity_guard_edit();
