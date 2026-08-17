-- 0081 — Quyền 'task.create': tạo task theo ROLE thay vì mở toang cho mọi người đã
-- đăng nhập (0001). Yêu cầu: member vào Bảng Sprint phải thấy nút tạo task, và admin
-- phải bật/tắt được việc đó theo role — trước đây không có gì để tắt vì policy mở sẵn.
--
-- Đi cùng web: MEMBER_PERMS (types.ts) thêm 'task.create'; các nút Tạo task
-- (SprintBoard/Backlog/MyTasks/Features) gate bằng can('task.create') — GƯƠNG với policy
-- này, đổi một bên PHẢI đổi bên kia (xem ghi chú ở DEFAULT_MEMBER_PERMS).
--
-- KHÔNG cho vào nhóm quyền mặc định của has_perm() (0079): mặc định thì công tắc trong
-- RoleEditor thành đồ trang trí. Thay vào đó SEED vào mọi role hiện có ở cuối file —
-- hành vi hôm nay giữ nguyên (ai có role đều tạo được task), nhưng từ giờ thu hồi được
-- theo từng role. Member CHƯA chọn role sẽ không tạo được task — RolePicker đã bắt chọn
-- role ngay lần đăng nhập đầu nên nhóm này thực tế rỗng.
--
-- LƯU Ý: bot (service_role) bỏ qua RLS — luật "tạo task mở cho mọi người" phía bot nằm ở
-- bot/skills/permissions.py và KHÔNG đổi trong migration này.

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check ( char_length(title) > 0 and public.has_perm('task.create') );

-- Seed: mọi role hiện có nhận 'task.create' (idempotent — chạy lại không nhân đôi).
update public.roles
  set perms = array_append(perms, 'task.create')
  where not (perms @> array['task.create']);
