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
| `dailyReportWebhook` | string \| null | Discord webhook URL cho báo cáo task hằng ngày 10:30 (migration `0047`). Job ngoài `daily-report-notion` (đọc bằng service_role) gửi report của project này vào đây. Rỗng = không gửi |
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

## `project_members` (ai ở trong dự án)

Danh sách **tường minh** người thuộc một dự án (migration `0052`). Trước đây "thành viên của
dự án" chỉ suy gián tiếp từ task; giờ admin **chọn người** (từ roster toàn web `profiles`) để
cho vào dự án. Bảng N-N thuần, không có id riêng — khoá chính là cặp `(project_id, user_id)`.

| Field        | Type        | Notes                                                         |
|--------------|-------------|---------------------------------------------------------------|
| `project_id` | uuid (PK)   | → `projects.id`, `on delete cascade`                          |
| `user_id`    | uuid (PK)   | → `profiles.id`, `on delete cascade`                          |
| `added_at`   | timestamptz | mặc định `now()`                                              |
| `added_by`   | uuid \| null| → `profiles.id` (`on delete set null`) — ai đã thêm người này |

- **RLS**: `select` mở cho mọi user đã đăng nhập (roster dự án không nhạy cảm); `insert`/`delete`
  chỉ `is_admin()` (đã bao owner). Realtime bật + `replica identity full` để event DELETE mang
  đủ cột cho bộ lọc `project_id=eq.<id>`.
- **Backfill** (chạy trong migration): gieo mỗi dự án bằng tất cả người đã dính task của nó
  (assignee + reporter + watchers), miễn còn hồ sơ thật — dự án đang chạy không trống trơn.
- Web: tab **Thành viên** trong dự án (`ProjectMembers` + `useProjectMembers`); thêm/gỡ qua
  `lib/projectMemberWrites.ts`. Roster TOÀN BỘ (tạo/sửa hồ sơ, vai trò) nằm ở khu quản trị
  NGOÀI dự án (`GlobalAdmin`, mở từ trang chọn dự án).

---

## `member_compensation` / `project_cost_items` / `project_cost_projections` (Chi phí dự án)

Dữ liệu tab **Chi phí** (khu Quản trị NGOÀI dự án — migration `0053`, `0054`). Chỉ **web** dùng;
bot không đụng. Vì chứa **lương** (nhạy cảm) nên RLS khoá **admin-only cho CẢ ĐỌC lẫn GHI** —
chặt hơn các bảng khác vốn mở đọc. Cả ba bật realtime + `replica identity full`. Không seed dữ
liệu lúc migration — chi phí thiết bị seed bằng nút "Thêm mẫu" trong UI.

**`member_compensation`** — lương + thời gian làm việc của MỘT NGƯỜI, **toàn cục** (không theo
dự án). Điền ở chi tiết thành viên (`MemberModal`, tab Thành viên). TÁCH khỏi `profiles` vì
`profiles` mở đọc cho mọi user — để lương ở đó là lộ. Chi phí từng dự án lấy mức lương này cho
các thành viên của dự án (`project_members`) → "pick người là có thông tin luôn".

| Field            | Type         | Notes                                              |
|------------------|--------------|----------------------------------------------------|
| `member_id`      | uuid (PK)    | → `profiles.id`, `on delete cascade`               |
| `monthly_salary` | numeric      | lương/tháng (VND)                                  |
| `start_date`     | date \| null | ngày bắt đầu làm                                   |
| `end_date`       | date \| null | ngày nghỉ; null = còn đang làm                     |
| `updated_at`     | timestamptz  | `now()`                                            |
| `updated_by`     | uuid \| null | → `profiles.id` (`on delete set null`)             |

> Bảng cũ `project_cost_employees` (0053, lương theo-dự-án) đã bị **drop ở 0054**, thay bằng
> `member_compensation` toàn cục theo yêu cầu "tập trung 1 chỗ ở chi tiết thành viên".

**`member_comp_history`** — lịch sử ĐỔI LƯƠNG (0057/0058): `id, member_id→profiles,
old_salary (null = điền lần đầu), new_salary, effective_from (ngày ÁP DỤNG mức mới — khác
changed_at là lúc bấm Lưu), changed_at, changed_by`. Do **trigger** `log_member_comp_change`
(SECURITY DEFINER) trên `member_compensation` ghi — mọi đường ghi đều bị bắt, chỉ ghi khi mức
lương THẬT SỰ đổi; client chỉ đọc (RLS select admin-only, không có policy ghi).
`member_compensation.effective_from` giữ ngày áp dụng của mức HIỆN TẠI. Hiện ở chi tiết
thành viên (📈 Lịch sử lương).

**`project_cost_items`** — DANH MỤC chi phí thiết bị/vận hành (mô hình gán theo người, 0056):

| Field          | Type         | Notes                                                       |
|----------------|--------------|-------------------------------------------------------------|
| `id`           | uuid (PK)    | `gen_random_uuid()`                                         |
| `project_id`   | uuid         | → `projects.id`, `on delete cascade`                       |
| `name`         | text         | tên khoản (Bộ PC, Văn phòng…)                             |
| `amount`       | numeric      | số tiền (VND)                                              |
| `kind`         | text         | `one_time` (ban đầu 1 lần) \| `annual` (theo năm)          |
| `sort_order`   | int          | thứ tự                                                     |
| `created_at`   | timestamptz  | `now()`                                                    |
| `created_by`   | uuid \| null | → `profiles.id` (`on delete set null`)                     |

> `per_employee` (0053) đã **bỏ ở 0056** — thay bằng gán đích danh qua bảng dưới.

**`project_cost_member_items`** — khoản nào gán cho NGƯỜI nào (popup multi-select ở bảng lương):

| Field        | Type         | Notes                                                          |
|--------------|--------------|----------------------------------------------------------------|
| `project_id` | uuid (PK)    | → `projects.id`, `on delete cascade`                          |
| `member_id`  | uuid (PK)    | → `profiles.id`, `on delete cascade`                          |
| `item_ids`   | uuid[]       | ids vào `project_cost_items`; id khoản đã xoá còn sót → phía đọc lọc |
| `updated_at` / `updated_by` | timestamptz / uuid \| null | ai sửa lần cuối                  |

**`project_cost_projections`** — DỰ CHI (what-if): tuyển thêm + outsource:

| Field        | Type         | Notes                                                        |
|--------------|--------------|--------------------------------------------------------------|
| `id`         | uuid (PK)    | `gen_random_uuid()`                                          |
| `project_id` | uuid         | → `projects.id`, `on delete cascade`                        |
| `kind`       | text         | `hire` (tuyển thêm) \| `outsource` (thuê ngoài)             |
| `label`      | text         | vị trí/mô tả (VD "Dev Unity")                               |
| `amount`     | numeric      | số tiền (VND) — nghĩa tuỳ `cadence`                         |
| `cadence`    | text         | `monthly` (×tháng) \| `one_time` (×1) \| `annual` (×tháng/12)|
| `head_count` | int          | số người/số suất (mặc định 1)                              |
| `item_ids`   | uuid[]       | khoản thiết bị/vận hành kèm MỖI suất (0056)                |
| `sort_order` | int          | thứ tự                                                      |
| `created_at` | timestamptz  | `now()`                                                    |
| `created_by` | uuid \| null | → `profiles.id` (`on delete set null`)                     |

- **Tính toán** (thuần, `web/src/lib/projectCost.ts`): cửa sổ = `horizon` tháng kể từ THÁNG
  HIỆN TẠI (slider chọn số tháng — dự trù N tháng tới; từng neo nhầm vào người vào sớm nhất
  làm cả bảng 0 ₫). Tổng lương cộng theo TỪNG THÁNG (mỗi tháng cộng người còn active). Thiết bị/vận hành (`overheadTotal`): khoản GÁN cho nhân sự → `one_time` 1
  lần/người, `annual` × (số tháng người đó làm việc trong cửa sổ / 12); gán cho dự chi →
  × `head_count`, `annual` × horizon/12; khoản KHÔNG gán ai → một suất chung (1 lần /
  × horizon/12). Dự chi tiền mặt: `amount × head_count × hệ số cadence`.
**Kế hoạch tài chính (0059)** — ba bảng phụ, đều RLS admin-only:
- `project_cost_settings(project_id pk, tet_bonus_months default 1, tet_bonus_month 1–12 default 1)`
  — thưởng Tết = N THÁNG LƯƠNG/người, trả vào tháng cấu hình, tính theo lương TẠI THÁNG TRẢ.
- `project_revenue(project_id, month date đầu-tháng, amount)` — doanh thu DỰ KIẾN theo tháng.
- `member_salary_plan(id, member_id, effective_from, monthly_salary)` — bậc DỰ TÍNH tăng
  lương (toàn cục theo người, điền ở MemberModal); engine đọc thành lương bậc thang.
- Engine `buildCostSeries` (web/src/lib/projectCost.ts) tính MỌI bucket theo TỪNG THÁNG
  (lương bậc thang, Tết, BHXH, TB&VH, dự chi, doanh thu) — thẻ tổng = Σ series = đúng số
  biểu đồ (tab 📊 trong Chi phí). CHECK `project_cost_items.kind` nới thêm 'monthly' ở 0059.
- **BHXH (Cty đóng)**: bảng bậc trong `BHXH_GRADES` (projectCost.ts) chép từ
  `docs/bhxh.xlsx` — lương đóng BHXH = bậc CAO NHẤT có tổng lương HĐLĐ ≤ lương thực;
  Cty đóng 21.5% (17.5 BHXH + 3 BHYT + 1 BHTN) trên mức đó, tính mỗi tháng active, nhảy
  bậc theo lương bậc thang; suất TUYỂN THÊM trả lương tháng cũng gánh, outsource thì
  không; thưởng Tết không đóng BHXH. Đổi thang lương = sửa `docs/bhxh.xlsx` **và**
  `BHXH_GRADES` (hằng số chép tay, không tự đọc file).

- **Web**: sống ở khu quản trị NGOÀI dự án (`GlobalAdmin`). **Lương** điền một chỗ ở chi tiết
  thành viên (`MemberModal`, tab Thành viên), ghi qua `upsertMemberComp`. Tab **Chi phí**
  (`CostAdmin` → `CostManagement` + `components/cost/*`) chọn dự án qua `useAdminCostProject`,
  ghép `project_members` với `member_compensation` (hook `useMemberComp`) ra bảng lương CHỈ ĐỌC,
  cộng với thiết bị (`useProjectCosts`) + dự chi. `lib/costWrites.ts` cho mọi ghi. Admin-only ở
  cả nav lẫn RLS.

---

## `member_sprint_notes` (đánh giá thành viên theo sprint)

Ghi chú có cấu trúc cho MỘT người trong MỘT sprint (tuần) — migration `0059`. Hiện ở tab **Đánh
giá** (`Reviews`, view id `reviews`) trong **khu quản trị chung NGOÀI dự án** (`GlobalAdmin`, cạnh
Thành viên/Chi phí — dữ liệu toàn cục theo người) và tab **Ghi chú** trong `MemberModal`. Nhạy cảm
(đánh giá của quản lý) → RLS **admin-only cho CẢ ĐỌC lẫn GHI** (`is_admin()` bao owner), y như
`member_compensation`. Một dòng DÙNG CHUNG cho mỗi `(member_id, sprint_id)` (khoá upsert), sửa-đè;
`updated_by` = người sửa cuối (KHÔNG lưu tác giả gốc — upsert ghi đè mọi cột truyền vào).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | `gen_random_uuid()` |
| `member_id` | uuid | → `profiles.id`, `on delete cascade` (người được đánh giá) |
| `sprint_id` | uuid | → `sprints.id`, `on delete cascade` |
| `overview` | text | Tổng quan ("tuần này thế nào") |
| `highlights` | text | Điểm nổi bật |
| `concerns` | text | Điểm cần lưu ý |
| `rating` | smallint \| null | 1..5 (CHECK); null = chưa chấm. Nhãn: `NOTE_RATINGS` trong `web/src/types.ts` |
| `updated_at` / `updated_by` | timestamptz / uuid \| null | writer set inline (không trigger như `member_compensation`) |
| `created_at` | timestamptz | `now()` |

- **RLS**: 4 policy admin-only (select/insert/update/delete). Realtime + `replica identity full`.
- **Web**: hook `useSprintNotes(sprintId)` (live, `byMember` Map, `enabled=isAdmin`); ghi qua
  `upsertMemberSprintNote` / `deleteMemberSprintNote` (`lib/memberReviewWrites.ts`); lịch sử theo
  người qua `fetchMemberNotes` (embed `sprints`). **Bot chỉ ĐỌC** (tổng hợp AI — xem dưới).

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
| `attachments` | jsonb     | link tài liệu + ảnh ref dùng chung mọi task của feature (0019) |
| `memberIds`   | uuid[]    | **người tham gia thêm tay** (→ `profiles.id`), migration 0046. UI gộp với người suy từ task; task mới thuộc feature auto-gắn cả hai nhóm vào `tasks.watcherIds`. Denormalize, không FK từng phần tử |
| `doneAt`      | Timestamp \| null | mốc đánh dấu TAY là đã xong (0031); `null` = suy từ task |
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
| `status`       | string            | `open` \| `reopen` \| `fixing` \| `pending` \| `deployed` \| `done` (Kanban columns; `reopen` thêm ở 0055) |
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
- **Status ← workflow tag** (cả hai chiều dùng chung luật): tag → cột theo ưu tiên
  **Re-open > Done > Deployed > Pending > Fixing**, không có tag workflow = Open. Tên tag
  nhận nhiều biến thể (`Re-open`/`Reopen`) — nguồn sự thật: `_STATUS_PRECEDENCE`
  (`bot/skills/bug_sync.py`) gương với `STATUS_ALIASES` (`web/src/lib/bugStatus.ts`).
  Web kéo card sang cột mà palette THIẾU nhãn workflow đó thì tự tạo nhãn
  (`ensureStatusLabel`) — thiếu nhãn là status đổi mà không có gì push, lần sync sau
  kéo card về cột cũ.

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

## `member_review_requests` & `member_period_reviews` (tổng hợp đánh giá AI)

Tổng hợp AI theo **tháng/quý** từ `member_sprint_notes` — migration `0060`. Cùng khuôn hàng-đợi
`member_dm_requests` (`0025`): web (tab Đánh giá, nút **Phân tích AI**) insert 1 dòng
`member_review_requests`; bot (service-role) quét mỗi `bug_sync_poll_seconds`, đọc ghi chú trong
kỳ, gọi **Claude CLI** (`bot.ask_claude_text` + `skills/member_review.py`) viết đánh giá, ghi
`member_period_reviews`, rồi cập nhật `status`/`result`. RLS admin-only.

**`member_review_requests`** `{ id, target_user_id→profiles, period_kind (month|quarter),
period_start, period_end (date — web tính sẵn), force (bool — chạy lại dù đã có), requested_by,
status (pending|done|error), result, created_at, processed_at }`. Insert + select `is_admin()`.

**`member_period_reviews`** (kết quả bền, dùng cho hiển thị + idempotency) `{ id, member_id→profiles,
period_kind, period_start, period_end, summary (văn bản AI), source_note_count, model, status
(done|empty), generated_by, generated_at }`, unique `(member_id, period_kind, period_start)`. RLS
**chỉ select `is_admin()`** — KHÔNG có policy ghi cho client, chỉ bot service-role ghi (như
`member_comp_history`). Web đọc live qua `usePeriodReviews`.

> **Quy ước gán sprint vào kỳ = GIAO khung thời gian**: ghi chú thuộc kỳ nếu sprint của nó giao
> `[period_start, period_end]` (`start_date <= period_end AND end_date >= period_start`; sprint
> thiếu ngày bị loại). Web tính `period_start/end` (`lib/period.ts`) nên bot KHÔNG làm toán ranh
> giới. `force=false` + đã có review → bot bỏ qua (khỏi tốn LLM); kỳ rỗng → lưu `status='empty'`.
> Cố ý KHÔNG đăng ký trong `bot/hints.py` — chỉ chạy qua nút web, dữ liệu nhạy cảm (không cho `@bot` gọi).

---

## `api_keys` (khoá cho app ngoài) & Edge Function `member-tasks`

`{ id, name, key_hash, enabled, created_at, last_used_at }` — migration `0043`.

Khoá truy cập cho **app ngoài** gọi API đọc dữ liệu. Lưu **SHA-256 hex** của key, không
bao giờ lưu key thô. RLS bật nhưng **không có policy nào** → anon/authenticated bị chặn
toàn bộ, chỉ service-role (Edge Function, bot) đọc/ghi. Thu hồi = `enabled=false`.

**Hai đường vào, cùng một gate key, cùng format trả về:**

1. **RPC PostgREST trực tiếp — KHUYÊN DÙNG** (migration `0045`, nhanh nhất: ~0.3s,
   không bao giờ cold start). `public.member_tasks` cố ý cho `anon` execute — gate
   nằm ở `p_key`; advisor than SECURITY DEFINER public là chủ đích, đừng "sửa":

```
POST https://<project-ref>.supabase.co/rest/v1/rpc/member_tasks
Headers: apikey: <anon/publishable key>, Content-Type: application/json
Body:    { "p_key": "<key thô>",
           "p_email" | "p_user_id" | "p_discord_id": ...,   (đúng MỘT định danh)
           "p_status": "active" (mặc định) | "all" | "todo,review",
           "p_project_id": "<uuid>" (tuỳ chọn) }
```

   Luôn trả HTTP 200; lỗi nằm trong body: `{"error": "unauthorized" |
   "member_not_found" | "bad_status" | "need_one_identifier"}`.

2. **Edge Function `member-tasks`** (`supabase/functions/member-tasks/index.ts`,
   `verify_jwt=false`) — chậm hơn (cold start ~2s) nhưng RESTful hơn: GET, mã lỗi
   HTTP thật (401/404/400), có CORS cho browser:

```
GET https://<project-ref>.supabase.co/functions/v1/member-tasks
Header:  x-api-key: <key thô>
Params:  email= | user_id= | discord_id=   (đúng MỘT định danh)
         status=active (mặc định: todo,in_progress,review) | all | "todo,review"
         project_id=<uuid> (tuỳ chọn)
```

Trả `{ member, statusFilter, count, tasks[] }` — camelCase; mỗi task kèm
`project/feature/sprint {id,name}`, `subtasks {done,total}`, `overdue`, và `shortCode`
để app ngoài tự ghép link web `/t/<shortCode>`. Sắp theo trạng thái
(in_progress → review → todo → done) rồi hạn chót.

**Vì tốc độ, toàn bộ logic nằm trong RPC `api_member_tasks`** (migration `0044`,
SECURITY DEFINER, revoke anon/authenticated — chỉ service_role gọi): check key → tìm
nhân sự → lấy task + join project/feature/sprint, MỘT round-trip DB. Edge Function chỉ
validate input, hash key rồi `fetch` RPC — cố ý KHÔNG import supabase-js (nạp npm làm
cold start chậm gấp rưỡi). Đo thực tế: xử lý server ~0.3–0.65s, cold start ~2s.

> ⚠️ RPC nhận **hash** của key (tính ở Edge Function), không nhận key thô — tránh key
> lọt vào log SQL. Key thô đưa cho app ngoài; thêm app mới = sinh key, insert
> `sha256(key)` vào `api_keys` với `name` riêng.
> ⚠️ Nếu quay lại query PostgREST trực tiếp: embed từ `tasks` sang `sprints` phải hint
> FK (`sprints!tasks_sprint_id_fkey`) vì còn đường thứ hai qua `task_sprints`.

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
PeriodKind   = month | quarter          (member_review_*, migration 0060)
NoteRating   = 1 | 2 | 3 | 4 | 5        (member_sprint_notes.rating; nhãn NOTE_RATINGS ở types.ts)
```
