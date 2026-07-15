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
| `role`        | string    | permission level: `admin` \| `member` (default `member`)     |
| `jobRole`     | string    | job discipline (see enum below); chosen at first sign-in     |
| `discordId`   | string    | Discord user id, links a Discord account to this user (opt.) |
| `notionUserId`| string    | Notion user id, for assigning the Notion "people" prop (opt.)|
| `createdAt`   | Timestamp | first sign-in                                                |
| `lastSeenAt`  | Timestamp | updated on each sign-in                                      |

> **Permission role (`role`)** — an **admin** manages members, sprints, the sign-in allowlist,
> and all tasks (create/edit/delete). A **member** can only change the status of tasks they own
> (assignee or reporter). Promote the first user by setting `role: "admin"` in the console.
>
> **Job role (`jobRole`)** — a separate discipline field the user picks on first sign-in:
> `developer` · `2d_artist` · `game_designer` · `sound_designer` · `ui_artist` · `animator`.
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
| `createdAt`       | Timestamp      | creation time                                             |
| `createdBy`       | string         | uid of creator                                            |

> The Notion project list is fetched on demand via `POST /api/notion { action: 'list-projects' }`
> (reads `NOTION_PROJECTS_DB_ID`). Tasks reference a project by `projectId`.

---

## `features/{featureId}`

A feature: a unit of product work **inside a project**. A task optionally attaches to one
feature (`tasks.featureId`). Admin-managed. In Postgres: `public.features`, `project_id`
FK → `projects(id)` `on delete cascade`; RLS = read for all signed-in, write for admin.

| Field         | Type      | Notes                                            |
|---------------|-----------|--------------------------------------------------|
| `id`          | string    | mirror of row id                                 |
| `projectId`   | string    | owning project (`projects/{id}`) — required      |
| `name`        | string    | feature name (1–120 chars)                       |
| `icon`        | string    | emoji shown on the feature card                  |
| `color`       | string    | accent hex for the card                          |
| `description` | string    | optional short description                       |
| `createdAt`   | Timestamp | creation time                                    |
| `createdBy`   | string    | uid of creator                                   |

---

## `tasks/{taskId}`

A unit of work. Doc id is auto-generated. `sprintId = null` means it is in the **backlog**.

| Field          | Type              | Notes                                                   |
|----------------|-------------------|---------------------------------------------------------|
| `id`           | string            | mirror of doc id                                        |
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
| `subtasks`     | Subtask[]         | checklist; drives the task progress bar                 |
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
| `createdAt` / `updatedAt` | Timestamp | timestamps (`updatedAt` via trigger)                    |

### Discord forum sync (two-way)

The bot keeps a Discord **forum channel** and `bugs` in sync **both directions**:

- **Discord → app:** each post → a bug (title, description = first message, reporter via
  `profiles.discord_id`). Forum tags → `bug_labels`, linked by `discordTagId` (not just
  name); a thread's applied tags → `bug.labelIds`. Upsert keyed by `discordThreadId`;
  re-syncs refresh content but **preserve** `status`/`assigneeId`.
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
