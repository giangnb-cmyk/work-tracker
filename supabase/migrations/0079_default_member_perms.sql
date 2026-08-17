-- Bốn quyền thành MẶC ĐỊNH cho MỌI người đã đăng nhập, không cần role, không cần cấp lẻ:
--   task.delete · task.edit_any · label.manage · doc.manage
--
-- Đội làm việc tin nhau, và trước đó đúng bốn việc này là thứ hay tắc nhất: sửa hộ một
-- task giao nhầm người, dọn một nhãn đặt sai, sửa link tài liệu người khác dán hỏng — đều
-- phải đi nhờ admin. Ba quyền còn NGUY HIỂM hơn (xoá feature, quản lý sprint, thêm/gỡ
-- người khỏi dự án) vẫn phải cấp qua role.
--
-- Đặt ở has_perm() — MỘT chỗ. Mọi policy RLS (0034/0074) đều hỏi qua hàm này, nên không
-- phải sửa 12 policy và cũng không sợ sót một cái. Web đọc cùng danh sách qua
-- DEFAULT_MEMBER_PERMS (types.ts) để nút hiện đúng với thứ server thật sự cho phép.
--
-- LƯU Ý HỆ QUẢ: "xoá task bất kỳ" giờ ai cũng làm được. Muốn thu lại thì sửa mảng dưới đây
-- rồi chạy lại migration — KHÔNG rải điều kiện ra từng policy.
create or replace function public.has_perm(p text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    -- Quyền mặc định: ai đăng nhập cũng có. Chặn `anon` bằng auth.uid() is not null —
    -- hàm này SECURITY DEFINER nên phải tự kiểm, không dựa vào chỗ gọi.
    ((select auth.uid()) is not null
      and p in ('task.delete', 'task.edit_any', 'label.manage', 'doc.manage'))
    or exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and (
          pr.role in ('admin', 'owner')
          or p = any(pr.perms)
          or exists (
            select 1 from public.roles r
            where r.id = pr.role_id and p = any(r.perms)
          )
        )
    );
$$;

-- Giữ nguyên GRANT của 0034 (create or replace không đụng tới, ghi lại cho rõ ý định).
revoke execute on function public.has_perm(text) from public, anon;
grant  execute on function public.has_perm(text) to authenticated;
