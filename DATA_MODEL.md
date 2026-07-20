# Data Model

> **Migration in progress (branch `migrate/supabase`).** The source of truth is moving to
> **Supabase Postgres** — the authoritative schema is now `supabase/migrations/*.sql`
> (snake_case columns; the web/bot map to the camelCase names below). This document
> describes the shared shape; see `MIGRATION_SUPABASE.md` for status. The Firestore notes
> below remain the reference for field semantics during the cutover.

## (legacy framing) Firestore

This file is the **single source of truth** for the Firestore schema shared by `web/` and
`bot/`. Change field/collection names here first, then update both sides and `firestore.rules`.

All collections are **top-level** (not subcollections) so the bot can query them with simple
filters and the web app can use flat `onSnapshot` listeners.

Timestamps are Firestore `Timestamp`. Enums are stored as lowercase strings.

---

## `users/{uid}`

One document per signed-in team member. Doc id = Firebase Auth `uid`.
Created/merged on first Google sign-in.

| Field         | Type      | Notes                                                        |
|---------------|-----------|--------------------------------------------------------------|
| `uid`         | string    | Firebase Auth uid (same as doc id)                           |
| `email`       | string    | Google account email                                         |
| `displayName` | string    | Full name from Google                                        |
| `photoURL`    | string    | Avatar url (may be empty)                                    |
| `role`        | string    | permission level: `owner` \| `admin` \| `member` (default `member`, enum `user_role`) |
| `perms`       | string[]  | quyền lẻ admin cấp thêm cho member: `task.delete` \| `feature.create` (migration 0034). Admin nghiễm nhiên có đủ — mảng này chỉ có nghĩa với member. |
| `jobRole`     | string    | job discipline (see enum below); chosen at first sign-in     |
| `discordId`   | string    | Discord user id, links a Discord account to this user (opt.) |
| `notionUserId`| string    | Notion user id, for assigning the Notion "people" prop (opt.)|
| `createdAt`   | Timestamp | first sign-in                                                |
| `lastSeenAt`  | Timestamp | updated on each sign-in                                      |

> **Permission role (`role`)** — an **admin** manages members, sprints, the sign-in allowlist,
> and all tasks (create/edit/delete). A **member** can change the status of tasks they own
> (assignee or reporter), and on tasks they CREATED (reporter) can also edit: assignee,
> feature, due date, subtasks, description, attachments — but **never story points**
> (admin-only; enforced by the `tasks_guard_points` trigger, migration 0024, on top of the
> UI gate). Title/priority/sprint/watchers stay admin-only. New tasks default their due
> date to the sprint's last day (web TaskModal + bot `_due_window`). Promote the first
> user by setting `role: "admin"` in the console.
>
> **Owner (migration 0037)** — one tier above admin. Owner có **mọi quyền admin**
> (`is_admin()` bao cả owner) **cộng** độc quyền cấp/đổi vai trò: phong admin, gỡ admin.
> Admin thường KHÔNG đổi được cột `role` của bất kỳ ai — chốt bằng trigger
> `profiles_guard_role` + hàm `is_owner()`. UI: ô "Vai trò" trong `MemberModal` chỉ owner
> chỉnh được (và không tự hạ vai trò owner qua UI). Bot gom owner vào `ADMIN_ROLES`
> (`skills/constants.py`) — bot không có skill đổi vai trò nên không phân biệt owner/admin.
>
> **Quyền lẻ (`perms`, migration 0034)** — admin cấp thêm từng quyền cho member trên tab
> Thành viên: `task.delete` (xoá task BẤT KỲ — RLS `tasks_delete`) và `feature.create`
> (tạo feature — RLS `features_insert`; sửa/xoá feature vẫn admin). RLS đọc qua
> `has_perm(p)` (admin luôn true); trigger `profiles_guard_perms` chặn member tự sửa
> `perms` của chính mình. Nguồn danh sách quyền + nhãn UI: `MEMBER_PERMS` trong
> `web/src/types.ts`. Bot KHÔNG đọc `perms` — gate của bot vẫn là admin-only
> (`skills/permissions.py`, cố ý chặt hơn RLS).
>
> **Job role (`jobRole`)** — a separate discipline field the user picks on first sign-in:
> `developer` · `2d_artist` · `game_designer` · `sound_designer` · `ui_artist` · `animator`
> · `vfx_artist` · `qa`.
>
> Cột `job_role` là một **Postgres ENUM** (`job_role`), KHÔNG phải text tự do. Thêm vị
> trí mới cần HAI bước, thiếu bước nào cũng hỏng:
> 1. Thêm vào `JOB_ROLES` trong `web/src/types.ts` (nhãn + icon + ô chọn suy từ đó).
> 2. Migration `alter type public.job_role add value if not exists '<id>'` — nếu không,
>    lưu member với vị trí mới sẽ ném `22P02 invalid input value for enum` (xem 0040).
>
> It does not affect permissions.

---

## `config/access`

Single document holding the admin-managed **sign-in allowlist**. Admins edit it on the web
(Cấu hình page). Read by any signed-in user; written only by admins (see `firestore.rules`).

| Field     | Type     | Notes                                               |
|-----------|----------|-----------------------------------------------------|
| `emails`  | string[] | exact emails allowed to sign in                     |
| `domains` | string[] | email domains allowed (e.g. `easygoing.vn`)         |

> If **both arrays are empty**, sign-in is open to any Google account (bootstrap, so the first
> admin can get in). `VITE_ALLOWED_EMAIL_DOMAIN` acts as a fallback only while the list is empty.
> Enforcement runs client-side in `AuthContext` right after Google auth (rejected users are
> signed straight back out).

---

## `sprints/{sprintId}`

A time-boxed sprint. Doc id is auto-generated.

| Field       | Type      | Notes                                            |
|-------------|-----------|--------------------------------------------------|
| `id`        | string    | mirror of doc id (convenience)                   |
| `name`      | string    | e.g. `Sprint 12`                                 |
| `goal`      | string    | short sprint goal (may be empty)                 |
| `status`    | string    | `planning` \| `active` \| `completed`            |
| `startDate` | Timestamp | sprint start                                     |
| `endDate`   | Timestamp | sprint end (used for burndown + overdue checks)  |
| `createdAt` | Timestamp | creation time                                    |
| `createdBy` | string    | uid of creator                                   |

> Only **one** sprint should be `active` at a time (app convention, not enforced by rules).

---

## `projects/{projectId}`

A project created in-app, optionally linked to a Notion project page so task syncs can
set the Notion **Project** relation. Doc id is auto-generated. Admin-managed.

| Field             | Type           | Notes                                                     |
|-------------------|----------------|-----------------------------------------------------------|
| `id`              | string         | mirror of doc id                                          |
| `name`            | string         | project name (e.g. `P001 - Block Tile`)                   |
| `icon`            | string         | emoji shown on the project card                           |
| `color`           | string         | accent token/hex for the card                             |
| `description`     | string         | optional short description                                |
| `notionProjectId` | string \| null | Notion Projects-DB page id; drives the Notion relation    |
| `weeklySheetId`   | string \| null | Google Spreadsheet **id** cho weekly report (migration `0022`) |
| `releaseSheetId`  | string \| null | Google Spreadsheet **id** chứa lịch phát hành, tab `Timeline` (migration `0033`). KHÁC `weeklySheetId` — hai sheet khác nhau, xem `release_sync_requests` |
| `createdAt`       | Timestamp      | creation time                                             |
| `createdBy`       | string         | uid of creator                                            |

### Weekly report (`weeklySheetId`)

Bot điền báo cáo tuần vào **một Google Sheet riêng cho mỗi project** — đặt ở đây chứ không
phải `bot/settings.json` để admin sửa ngay trên web (popup **Dự án**), không phải đụng máy
chạy bot. Lưu **id**, không lưu URL: web bóc id từ link người dùng dán
(`extractSheetId` trong `lib/projectWrites.ts`). Rỗng = project chưa bật, bot bỏ qua im lặng.

Cấu trúc sheet đích (tab `Discussion`) là **ma trận**: cột A = nền tảng, B = hạng mục,
C = câu hỏi, và **mỗi tuần là một CỘT** (hàng 1 = ngày bắt đầu `dd/mm/yyyy`, hàng 2 = ngày
kết thúc). `bot/skills/weekly_report.py` ghi 2 ô:

| Ô đích (hàng dò theo NHÃN cột B/C, không hardcode số hàng) | Nguồn |
|---|---|
| `Tiến độ` / `Hiện tại` | task **đã xong** của sprint **trước** |
| `Tiến độ` / `Tiếp theo làm gì` | task **chưa xong** của sprint **hiện tại** |

> ⚠️ Ô này người thật đang viết tay. Skill **không bao giờ** ghi nội dung rỗng đè lên ô có
> chữ, và bỏ qua ô đã có nội dung trừ khi `--force`. Lần chạy tự động (thứ 2, `bot.py`)
> luôn `force=False`.
> ⚠️ `GOOGLE_SHEETS_MCP.md` thiết kế service account là **chỉ đọc** (share Viewer). Weekly
> report cần **GHI**, nên từng file sheet phải được share riêng quyền **Editor** cho email
> service account — chỉ share đúng file cần ghi, đừng nâng cả folder lên Editor.

> The Notion project list is fetched on demand via `POST /api/notion { action: 'list-projects' }`
> (reads `NOTION_PROJECTS_DB_ID`). Tasks reference a project by `projectId`.

---

## `features/{featureId}` & `feature_labels/{labelId}`

A feature: a unit of product work **inside a project**. A task optionally attaches to one
feature (`tasks.featureId`). Admin-managed. In Postgres: `public.features`, `project_id`
FK → `projects(id)` `on delete cascade`; RLS = read for all signed-in; **insert** for
admin hoặc member được cấp quyền lẻ `feature.create` (migration 0034); update/delete
vẫn admin-only.

**Model quy ước** (migration 0026): một feature là **đơn vị nhỏ deliver được**.
Nhóm lớn ("Shop", "Gameplay"…) KHÔNG phải feature — nó là **nhãn**; version delivery
("1.2.0") cũng là nhãn, nhận diện bằng tên (cùng regex `labelGroup` với bug). Việc chạy
liên tục không bao giờ xong (Polish…) vẫn là feature nhưng mang `kind = 'ongoing'`.

`kind` có BA giá trị (migration 0030 thêm `standard`) — CHECK ở DB chốt đúng ba:
- `delivery` — **gói bán**: thứ bán cho user (IAP, pack, offer). Có ngày xong, hiện % done.
- `standard` — **tính năng thường**: có ngày xong nhưng KHÔNG bán (Settings, Login,
  Tutorial…). Cư xử y hệt `delivery`, chỉ khác tên gọi.
- `ongoing` — **liên tục**: polish/tuning, không bao giờ "done" → UI hiện nhịp 30 ngày
  thay vì %, và `isFeatureDone` không bao giờ tính nó là hoàn thành.

> Code xét "đã xong" phải loại trừ theo `!== 'ongoing'`, ĐỪNG liệt kê loại nào được tính:
> thêm loại thứ tư mà quên sửa thì nó âm thầm không bao giờ xong.

| Field         | Type      | Notes                                            |
|---------------|-----------|--------------------------------------------------|
| `id`          | string    | mirror of row id                                 |
| `projectId`   | string    | owning project (`projects/{id}`) — required      |
| `name`        | string    | feature name (1–120 chars)                       |
| `icon`        | string    | emoji shown on the feature card                  |
| `color`       | string    | accent hex for the card                          |
| `description` | string    | optional short description                       |
| `kind`        | string    | `delivery` (mặc định, gói bán) \| `standard` (tính năng thường) \| `ongoing` (liên tục — KHÔNG hiện %, hiện nhịp 30 ngày) — xem ở trên |
| `labelIds`    | string[]  | ids into `feature_labels` — nhóm + version, dùng để lọc |
| `createdAt`   | Timestamp | creation time                                    |
| `createdBy`   | string    | uid of creator                                   |

**feature_labels** — per-project tag palette cho feature (cùng pattern `bug_labels`;
RLS: read all signed-in, write admin). Fields: `id`, `projectId`, `name` (1–40),
`color`, `icon`. Không có `discordTagId` — palette này không sync Discord.

---

## `tasks/{taskId}`

A unit of work. Doc id is auto-generated. `sprintId = null` means it is in the **backlog**.

| Field          | Type              | Notes                                                   |
|----------------|-------------------|---------------------------------------------------------|
| `id`           | string            | mirror of doc id                                        |
| `shortCode`    | string            | DB-generated 6-char base62, unique; short share link `/t/<code>` (migration 0039) |
| `title`        | string            | required, 1–140 chars                                   |
| `description`  | string            | markdown-ish free text (may be empty)                   |
| `sprintId`     | string \| null    | which sprint; `null` = backlog                          |
| `projectId`    | string \| null    | which project (`projects/{id}`); `null` = none          |
| `featureId`    | string \| null    | which feature (`features/{id}`); `null` = not attached  |
| `status`       | string            | `todo` \| `in_progress` \| `review` \| `done`           |
| `priority`     | string            | `low` \| `medium` \| `high` \| `urgent`                 |
| `assigneeId`   | string \| null    | uid of assignee                                         |
| `assigneeName` | string            | denormalized display name for cheap rendering / bot     |
| `reporterId`   | string            | uid (or bot marker) of who created the task             |
| `points`       | number            | story points (0 if unestimated)                         |
| `tags`         | string[]          | free tags                                               |
| `dueStart`     | Timestamp \| null | work-window start (creation day)                        |
| `dueDate`      | Timestamp \| null | work-window end / deadline; reset to done-day on finish |
| `order`        | number            | sort order within its status column (lower = higher)    |
| `createdAt`    | Timestamp         | creation time                                           |
| `updatedAt`    | Timestamp         | last modification                                       |
| `source`       | string            | `web` \| `discord` — where the task was created         |
| `notionPageId` | string \| null    | id of the linked Notion page (null until synced)        |
| `notionUrl`    | string \| null    | deep link to the Notion page (shown on the task card)   |
| `attachments`  | Attachment[]      | ref images + embedded links (see below)                 |
| `subtasks`     | Subtask[]         | checklist; drives the task progress bar. Đồng bộ sang Notion thành **to_do block** trong thân trang (tạo page → thêm; sửa subtask → xoá to_do cũ rồi thêm lại). App là nguồn sự thật của checklist; chỉ đụng block `to_do`, nội dung khác trong trang giữ nguyên. Chỉ web sửa subtask (bot không) |
| `watcherIds`   | string[]          | related people (uids) — mentioned on completion         |
| `watcherNames` | string[]          | denormalized display names of watchers                  |

**Attachment**: `{ id, kind: 'image'|'link', url, name, provider, storagePath? }`.
`provider` is one of `drive`/`discord`/`notion`/`figma`/`github`/`image`/`link` (detected from the
URL) and picks the icon shown on the task card. `storagePath` is set for images uploaded to
Firebase Storage (kept so the file can be deleted).

**Subtask**: `{ id, title, done }`. Task progress = done/total subtasks; if a task has no
subtasks, progress falls back to a status stage (`todo`=0, `in_progress`, `review`, `done`=100%).

### Status columns (Kanban)

`todo` → `in_progress` → `review` → `done`. The board renders one column per status.

### Common queries

- Board for a sprint: `tasks where sprintId == S order by order`
- My tasks: `tasks where assigneeId == uid and status != done`
- Backlog (board dropdown): `tasks where sprintId == null`
- Backlog **tab** (unassigned + unscheduled): `tasks where sprintId == null and assigneeId == null` (scoped to the current project)
- Overdue (bot reminder): `tasks where status != done and dueDate <= now`

---

## `visits` (thống kê truy cập web)

`{ id, user_id, at }` — migration `0023`. **Append-only**: 1 dòng = **1 phiên mở web**
(mở tab mới). F5 trong cùng tab không tính lại — chặn bằng `sessionStorage` trong
`lib/visitWrites.ts`. Cố ý **không** lưu đường dẫn/tab: câu hỏi cần trả lời là "ai vào bao
nhiêu lần", không phải theo dõi từng thao tác.

RLS **chặt hơn phần còn lại của dự án** (các bảng khác đều `select using (true)`):

| Thao tác | Ai |
|---|---|
| insert | chính chủ (`user_id = auth.uid()`) |
| select | **chỉ admin** (`is_admin()`) |
| update / delete | **không ai** — không có policy, nên client không sửa được lịch sử |

Ghi ở `AuthContext` **sau** cửa allowlist (người bị chặn không tính là một lượt). Đọc bằng
`hooks/useVisits.ts`; gom nhóm ở `lib/visitStats.ts` (thuần, tuần bắt đầu **thứ 2**). Hiển
thị ở tab **Truy cập** (`components/Visits.tsx`, admin-only).

> ⚠️ Chỉ có dữ liệu **từ khi áp `0023`** — quá khứ không hồi tố được.
> ⚠️ `profiles.last_seen_at` vẫn tồn tại nhưng bị **ghi đè** mỗi lần mở app: nó chỉ trả lời
> "lần cuối vào là bao giờ", không đếm được. Đừng nhầm hai thứ.

---

## `activity` (task feed)

`{ id, task_id, actor_id, actor_name, type, body, created_at }` — migration `0007`.

Ghi bằng **trigger DB**, không phải app: `tasks_log_created` (type `created`) và
`tasks_log_status` (type `status_change`, `body` = **trạng thái MỚI** dạng enum trần, ví dụ
`'done'` — không lưu trạng thái cũ). Client chỉ được insert `type = 'comment'` của chính mình;
không có policy UPDATE/DELETE nên feed là bất biến.

> ⚠️ Bot dùng service-role key nên `auth.uid()` là NULL → `actor_id` null, `actor_name` rỗng
> (UI hiện "Hệ thống"). `created_at` vẫn chính xác.
> ⚠️ Chỉ có dữ liệu **từ khi áp 0007**; `migrate_from_firestore.py` không insert vào bảng này
> nên task từ thời Firestore vĩnh viễn không có mốc thời gian.

## `audit_log` (nhật ký hệ thống)

`{ id, actor_id, actor_name, action, entity_type, entity_id, summary, project_id, meta, created_at }`
— migration `0035`. Tab **Hệ thống** (`components/SystemLog.tsx`, admin-only, view id `log`).

Ghi các hành động quản trị mà `activity` (per-task, cascade khi xoá task) KHÔNG giữ được:
- `task.delete` — trigger `after delete on tasks`; `meta = {title,status}` chụp lại **ngay lúc
  xoá** (sau đó hàng task không còn để tra tiêu đề). Đây là lý do phải dùng trigger chứ không
  ghi phía client.
- `feature.create` — trigger `after insert on features`; `meta = {name}`.
- `member.perms` — trigger `after insert or update on profiles` khi **role HOẶC perms** đổi (bỏ
  qua lượt tự tạo hồ sơ lúc đăng nhập và mọi update không đụng role/perms). `meta =
  {member_name, role_old/new, perms_old/new}`.

Cùng pattern `activity` (0007): ghi bằng **trigger SECURITY DEFINER** nên không giả mạo/bỏ sót
được; **không có policy insert** → client không tự bịa dòng log. RLS select `is_admin()` (như
`visits`); member đọc ra rỗng, không lỗi. `actor_name` = `'Bot'` khi ghi bằng service-role.

> ⚠️ `member.perms` đọc cột `profiles.perms` (migration `0034`) → **áp 0034 TRƯỚC 0035**.
> ⚠️ Chỉ có dữ liệu **từ khi áp 0035**; hành động trước đó không hồi tố được.

## `task_sprints` (lịch sử sprint của task)

`{ task_id, sprint_id, added_at }`, PK `(task_id, sprint_id)` — migration `0015`.

`tasks.sprint_id` là sprint **hiện tại**; bảng này lưu **mọi** sprint task từng thuộc về, để
đếm "task bị đẩy qua mấy sprint". Ghi bằng trigger `tasks_log_sprint` (`after insert or update
of sprint_id`) nên mọi đường ghi — kể cả bot — đều được ghi nhận; client không có policy ghi.

> ⚠️ Backfill của 0015 chỉ gán sprint **hiện tại** cho task cũ: task đã chuyển sprint TRƯỚC
> migration không hồi tố được, số "trễ N sprint" chỉ đúng từ ngày áp migration.

**RPC `task_report(p_project_id)`** (migration `0016`) → một dòng mỗi task:
`{ task_id, sprint_ids[], first_in_progress_at, first_done_at }`. Gộp ở Postgres để không chạm
trần 1000 dòng của PostgREST. Dùng bởi trang Hiệu suất (`web/src/hooks/useTaskReport.ts`).

---

## `bug_labels/{labelId}` & `bugs/{bugId}`

A per-project **bug tracker**. `bug_labels` is the project's tag palette; `bugs` are
reports shown on a Kanban board (by `status`) and a GitLab-style list. Postgres:
`public.bug_labels`, `public.bugs` (both `project_id` FK → `projects(id)` `on delete cascade`).

**bug_labels** — RLS: read all signed-in, write admin.

| Field       | Type   | Notes                                   |
|-------------|--------|-----------------------------------------|
| `id`        | string | row id                                  |
| `projectId` | string | owning project                          |
| `name`      | string | label text (1–40 chars)                 |
| `color`     | string | accent hex                              |
| `icon`      | string | optional emoji                          |
| `discordTagId` | string \| null | linked Discord forum tag id (two-way sync) |

**bugs** — RLS: read all; insert any signed-in; update admin/reporter/assignee; delete admin/reporter.
A `BEFORE INSERT` trigger assigns `number` = next per-project running id.

| Field          | Type              | Notes                                                       |
|----------------|-------------------|-------------------------------------------------------------|
| `id`           | string            | row id                                                      |
| `projectId`    | string            | owning project                                              |
| `number`       | number            | per-project running id (shown as `#530`)                    |
| `title`        | string            | 1–200 chars                                                 |
| `description`  | string            | repro / expected / actual                                   |
| `status`       | string            | `open` \| `fixing` \| `pending` \| `deployed` \| `done` (Kanban columns) |
| `labelIds`     | string[]          | ids into `bug_labels` (tag palette)                         |
| `reporterId` / `reporterName` | string \| null / string | who filed it                       |
| `assigneeId` / `assigneeName` | string \| null / string | who owns the fix                   |
| `order`        | number            | sort order                                                  |
| `discordThreadId` | string \| null | source Discord forum thread id (sync upsert key; unique)    |
| `pendingDiscordPush` | boolean | app changed the labels; bot still needs to push them to Discord |
| `createdAt` / `updatedAt` | Timestamp | `updatedAt` via trigger. Bug đến từ Discord: `createdAt` = lúc **tạo bài post**, không phải lúc bot sync — xem dưới |

### Discord forum sync (two-way)

The bot keeps a Discord **forum channel** and `bugs` in sync **both directions**:

- **Discord → app:** each post → a bug (title, description = first message, reporter via
  `profiles.discord_id`). Forum tags → `bug_labels`, linked by `discordTagId` (not just
  name); a thread's applied tags → `bug.labelIds`. Upsert keyed by `discordThreadId`;
  re-syncs refresh content but **preserve** `status`/`assigneeId`.
  `createdAt` được ghi từ **thời điểm tạo thread** (`Thread.created_at`, lùi về snowflake
  của thread id) ở cả nhánh insert lẫn update — bỏ nó thì cột rơi về `default now()` và
  bug báo tháng 3 mà sync tháng 7 sẽ hiện là tháng 7. Discord là nguồn sự thật cho mốc
  này, nên mỗi lần sync đều ghi đè (cùng một giá trị → lặp lại vô hại). Dữ liệu cũ đã
  được và lại một lần bằng migration `0020` (giải mã snowflake ngay trong SQL).
- **app → Discord:** changing a bug's labels in-app sets `pendingDiscordPush`; the bot
  rewrites that thread's applied tags to match (creating a forum tag for an app-only
  label if needed). While `pendingDiscordPush` is set, the Discord→app sync won't
  relabel that bug (the app edit wins until pushed).

Triggers: daily (default 09:00 `Asia/Ho_Chi_Minh`), `@bot sync bug`, or the web
"Sync Discord" button (queues `bug_sync_requests`, admin-only insert; the service-role
bot drains it and also pushes pending label edits every `bug_sync_poll_seconds`).
The bot needs **Manage Threads** (edit thread tags) and **Manage Channels** (create tags).

---

## `notifications/{notifId}`

In-app notifications (the "web" half of completion notices; Discord is the other half).
One document per recipient. Doc id is auto-generated. Created when a user confirms the
"task done" popup; each related person (assignee, reporter, watchers) gets one doc.

| Field         | Type      | Notes                                                   |
|---------------|-----------|---------------------------------------------------------|
| `recipientId` | string    | uid this notice is for (query key)                      |
| `taskId`      | string    | the task that was completed                             |
| `taskTitle`   | string    | denormalized task title for rendering                   |
| `type`        | string    | `task_done` (only kind for now)                         |
| `body`        | string    | ready-to-render message                                 |
| `actorName`   | string    | who completed the task                                  |
| `read`        | boolean   | flips true when the recipient opens the bell            |
| `createdAt`   | Timestamp | creation time (sorted client-side, newest first)        |

> Read/update/delete gated to `recipientId == auth.uid`; any signed-in user may create
> (the completer writes notices for others). No composite index — sorted in the client.

---

## `member_dm_requests` (hàng đợi DM test)

`{ id, target_user_id, requested_by, status, result, created_at, processed_at }` — migration `0025`.

Nút **🧪 Gửi test** ở tab **Cấu hình** (admin, `components/MemberDmTest.tsx`): web insert
1 dòng, bot (service-role) quét mỗi `bug_sync_poll_seconds`, DM điểm tuần cho
`target_user_id` (tin mở đầu bằng dòng 🧪 để member biết là test) rồi ghi lại `status`
(`pending → done | error`) + `result`. Cùng khuôn hàng-đợi với `bug_sync_requests`.

| Thao tác | Ai |
|---|---|
| insert | **chỉ admin** (`is_admin()`) |
| select | **chỉ admin** — chặt hơn `bug_sync_requests` (bảng đó ai đăng nhập cũng đọc được) |
| update / delete | **không ai** phía client — bot service-role bỏ qua RLS để ghi kết quả |

> Lịch DM hằng tuần (mặc định **thứ 5** 9h) cấu hình ở `bot/settings.json > member_dm`
> (`enabled` tắt là tắt cả lịch lẫn nút test). Nội dung DM (`bot/skills/member_dm.py`):
> số task **đã xong trong tuần** (từ thứ 2 00:00 giờ VN, đếm qua bảng `activity` — chỉ có
> dữ liệu từ khi áp `0007`), số task **tồn đọng** (có assignee, chưa done, kèm số trễ hạn,
> liệt kê tối đa 5 task) + 1 câu động viên. Chỉ DM người có `profiles.discord_id`.

---

## `release_sync_requests` (hàng đợi đồng bộ lịch phát hành)

`{ id, project_id, requested_by, status, result, created_at, processed_at }` — migration `0033`.

Nút **🔄 Sync lịch** ở tab **Timeline** (admin): web insert 1 dòng, bot (service-role)
quét mỗi `bug_sync_poll_seconds`, đọc tab **`Timeline`** của `projects.release_sheet_id`
(cột `Version | Date`) rồi ghi `feature_labels.release_date` cho nhãn version TRÙNG TÊN,
sau đó ghi lại `status` (`pending → done | error`) + `result`. Cùng khuôn hàng-đợi với
`bug_sync_requests` / `member_dm_requests`; RLS admin-only cả insert lẫn select.

> **Vì sao phải đi vòng qua bot**: web KHÔNG đọc được Google Sheets — service account chỉ
> có ở bot (`bot/skills/drive_gateway.py`). Skill: `bot/skills/release_sync.py`, chạy tay
> được: `python skills/release_sync.py --project <uuid>`.
>
> Bot đọc **serial thô** (`UNFORMATTED_VALUE`) chứ không đọc chuỗi đã format: `6/1/2026`
> không phân biệt được 1/6 với 6/1 — đoán sai là lệch cả lịch phát hành.
>
> Sheet có version mà app chưa có nhãn → **báo trong `result`, KHÔNG tự tạo nhãn**: nhãn
> là thứ người dùng gắn tay vào feature, để bot đẻ ra thì lạc nhãn lúc nào không biết.

---

## Notion sync

Tasks are mirrored to a Notion database. The Notion integration **token is a server-side
secret** and never ships in the web bundle. Both web and bot sync through a single gateway:

- **Gateway:** `web/api/notion.ts` — a Vercel Serverless Function. Actions: `create`, `update`.
- **Web → gateway:** authenticated with the caller's Firebase ID token (verified server-side).
- **Bot → gateway:** authenticated with the shared secret `NOTION_SYNC_SECRET`.
- On `create`, the gateway makes a Notion page and returns `{ notionPageId, notionUrl }`, which
  the caller writes back onto the task. On `update`, it sets the Notion **Status** property
  (and Assignee when changed).

### Notion database property mapping (configurable via env)

| Task field   | Notion property (default name) | Notion type            |
|--------------|--------------------------------|------------------------|
| `title`      | `Name` (`NOTION_PROP_TITLE`)   | title                  |
| `status`     | `Status` (`NOTION_PROP_STATUS`)| status / select        |
| `assignee`   | `Assignee` (`NOTION_PROP_ASSIGNEE`) | people or rich_text |
| `priority`   | `Priority` (`NOTION_PROP_PRIORITY`) | select (optional)  |
| `dueDate`    | `Due` (`NOTION_PROP_DUE`)      | date (optional)        |

Status values sent to Notion map from our enum via `NOTION_STATUS_MAP` (JSON), default:
`{"todo":"Todo","in_progress":"In progress","review":"Review","done":"Done"}`.

Assignee: if the assignee's `users` doc has a `notionUserId`, the gateway sets the **people**
property; otherwise it writes the display name into a rich_text property.

---

## Enums (keep in sync in `web/src/types.ts` and `bot/skills/constants.py`)

```
TaskStatus   = todo | in_progress | review | done
TaskPriority = low | medium | high | urgent
SprintStatus = planning | active | completed
UserRole     = admin | member
```
