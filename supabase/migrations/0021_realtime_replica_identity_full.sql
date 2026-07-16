-- Xoá task/bug xong UI không tự cập nhật, phải F5 mới thấy.
--
-- Nguyên nhân: `useLiveQuery` đăng ký postgres_changes KÈM filter (`sprint_id=eq.…`,
-- `assignee_id=eq.…`, `project_id=eq.…`). Với REPLICA IDENTITY DEFAULT, WAL chỉ ghi
-- KHOÁ CHÍNH của dòng vừa xoá, nên `old_record` của sự kiện DELETE chỉ có mỗi `id`:
-- Realtime không có cột nào để đối chiếu filter -> nó loại luôn sự kiện, client không
-- bao giờ được báo, và fetcher không chạy lại.
--
-- INSERT/UPDATE không dính vì bản ghi MỚI có đủ cột để khớp filter.
--
-- REPLICA IDENTITY FULL ghi cả dòng cũ vào WAL -> filter khớp được, DELETE về tới client.
-- Giá phải trả là WAL to hơn khi UPDATE/DELETE; với vài nghìn dòng ở đây thì không đáng kể.
--
-- Chỉ áp cho bảng CÓ filter VÀ có xoá. Bảng đăng ký không filter (sprints, profiles,
-- projects, features) không cần: không có filter nào để trượt.

-- tasks: useTasks (sprint_id), useProjectTasks (project_id), useMyTasks (assignee_id)
alter table public.tasks replica identity full;

-- bugs: useBugs (project_id), useMyBugs (assignee_id)
alter table public.bugs replica identity full;

-- bug_labels: useBugLabels (project_id)
alter table public.bug_labels replica identity full;

-- activity: useActivity (task_id) — cascade khi xoá task
alter table public.activity replica identity full;

-- notifications: useNotifications (recipient_id)
alter table public.notifications replica identity full;
