-- 0082 — "Quyền mặc định" đổi nghĩa: 0079 cấp CỨNG bốn quyền cho mọi người ngay trong
-- has_perm(), nên công tắc trong RoleEditor bị khoá — admin muốn thu quyền của một role
-- cũng không được. Yêu cầu mới: mặc định = BẬT SẴN theo role (tick sẵn khi tạo role,
-- seed vào role có sẵn), còn bật/tắt là việc của admin, từng role một.
--
-- Làm hai việc:
-- 1. has_perm() về lại dạng 0072: admin/owner ∪ perms lẻ ∪ perms của role — KHÔNG còn
--    khối "quyền mặc định cho mọi người".
-- 2. Seed bốn quyền từng-là-mặc-định vào MỌI role hiện có, để không ai mất quyền ngay
--    sau khi (1) chạy ('task.create' đã seed ở 0081). Từ giờ web tick sẵn bộ này khi
--    tạo role mới (DEFAULT_MEMBER_PERMS, types.ts) — cùng danh sách, đổi thì đổi cả hai.
--
-- HỆ QUẢ: người CHƯA có role (role_id null, perms rỗng) mất bốn quyền mặc định cũ —
-- nhóm này thực tế rỗng vì RolePicker chặn tới khi chọn role, và fail-closed là đúng chiều.

create or replace function public.has_perm(p text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
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

-- Seed idempotent — chạy lại không nhân đôi phần tử.
update public.roles set perms = array_append(perms, 'task.delete')   where not (perms @> array['task.delete']);
update public.roles set perms = array_append(perms, 'task.edit_any') where not (perms @> array['task.edit_any']);
update public.roles set perms = array_append(perms, 'label.manage')  where not (perms @> array['label.manage']);
update public.roles set perms = array_append(perms, 'doc.manage')    where not (perms @> array['doc.manage']);
