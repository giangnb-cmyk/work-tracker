# Data Model — Firestore (source of truth)

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

## `tasks/{taskId}`

A unit of work. Doc id is auto-generated. `sprintId = null` means it is in the **backlog**.

| Field          | Type              | Notes                                                   |
|----------------|-------------------|---------------------------------------------------------|
| `id`           | string            | mirror of doc id                                        |
| `title`        | string            | required, 1–140 chars                                   |
| `description`  | string            | markdown-ish free text (may be empty)                   |
| `sprintId`     | string \| null    | which sprint; `null` = backlog                          |
| `status`       | string            | `todo` \| `in_progress` \| `review` \| `done`           |
| `priority`     | string            | `low` \| `medium` \| `high` \| `urgent`                 |
| `assigneeId`   | string \| null    | uid of assignee                                         |
| `assigneeName` | string            | denormalized display name for cheap rendering / bot     |
| `reporterId`   | string            | uid (or bot marker) of who created the task             |
| `points`       | number            | story points (0 if unestimated)                         |
| `tags`         | string[]          | free tags                                               |
| `dueDate`      | Timestamp \| null | optional deadline (drives reminders)                    |
| `order`        | number            | sort order within its status column (lower = higher)    |
| `createdAt`    | Timestamp         | creation time                                           |
| `updatedAt`    | Timestamp         | last modification                                       |
| `source`       | string            | `web` \| `discord` — where the task was created         |
| `notionPageId` | string \| null    | id of the linked Notion page (null until synced)        |
| `notionUrl`    | string \| null    | deep link to the Notion page (shown on the task card)   |

### Status columns (Kanban)

`todo` → `in_progress` → `review` → `done`. The board renders one column per status.

### Common queries

- Board for a sprint: `tasks where sprintId == S order by order`
- My tasks: `tasks where assigneeId == uid and status != done`
- Backlog: `tasks where sprintId == null`
- Overdue (bot reminder): `tasks where status != done and dueDate <= now`

---

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
