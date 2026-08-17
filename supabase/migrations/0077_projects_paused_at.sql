-- Tạm dừng dự án TỪ NGÀY NÀO (đi kèm is_active — migration 0076).
--
-- Bất biến: `paused_at IS NOT NULL` <=> `is_active = false`. Bật lại thì XOÁ mốc, không
-- giữ lại: để nguyên thì một dự án đang chạy vẫn mang một ngày tạm dừng cũ, đọc ra không
-- biết nó đang dừng hay đã bật lại.
--
-- Đóng dấu bằng TRIGGER chứ không để phía web tự gửi:
--   * cờ này đổi được từ nhiều đường — web, bot (service_role), hay sửa tay bằng SQL. Ai
--     quên gửi kèm mốc là dữ liệu lệch ngay, mà lệch kiểu này thì im lặng.
--   * mốc phải là giờ CỦA SERVER. Nhận timestamp do trình duyệt gửi lên là nhận luôn cái
--     đồng hồ máy người dùng, lệch giờ/lệch ngày là chuyện thường.
alter table public.projects
  add column if not exists paused_at timestamptz;

comment on column public.projects.paused_at is
  'Thời điểm dự án bị chuyển sang TẠM DỪNG (trigger tự đóng dấu). NULL khi dự án đang chạy.';

create or replace function public.projects_stamp_paused_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- Tạo mới mà đã tắt sẵn (import dự án cũ) thì vẫn phải có mốc.
    new.paused_at := case when new.is_active then null else now() end;
  elsif new.is_active is distinct from old.is_active then
    new.paused_at := case when new.is_active then null else now() end;
  else
    -- Không đổi trạng thái -> giữ nguyên mốc cũ, kể cả khi client gửi lên giá trị khác.
    new.paused_at := old.paused_at;
  end if;
  return new;
end;
$$;

-- KHÔNG phải SECURITY DEFINER: hàm chỉ nắn cột trên NEW của chính hàng đang ghi, quyền ghi
-- hàng đó đã do RLS của `projects` (update = is_admin()) quyết định trước rồi.
revoke execute on function public.projects_stamp_paused_at() from public, anon, authenticated;

drop trigger if exists projects_stamp_paused_at on public.projects;
create trigger projects_stamp_paused_at
  before insert or update on public.projects
  for each row execute function public.projects_stamp_paused_at();

-- Dữ liệu đang có: dự án nào đã tắt từ trước migration này thì chưa có mốc. Không biết
-- ngày thật -> đóng dấu now() để cột không rỗng một cách khó hiểu (hiện tại chưa dự án nào
-- tắt nên câu này không đụng hàng nào).
update public.projects set paused_at = now() where is_active = false and paused_at is null;
