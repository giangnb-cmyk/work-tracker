# CLAUDE.md

## Project Context

**Bot Work Tracker** — a sprint, task & bug management app for a software team.

Two deliverables share one **Supabase** project (Postgres + Auth + Storage + Realtime):

1. **`web/`** — React + Vite + TypeScript single-page app. Team members sign in with
   Google, pick a project, then manage sprints on a board, triage tasks and bugs, and
   view dashboards. Deployed to **Vercel** as a static build from GitHub.
2. **`bot/`** — Python `discord.py` Discord bot backed by the **Supabase service-role
   key** (`supabase-py`). Reads/writes the **same** Postgres data. Responds when tagged
   by delegating to the Claude CLI, which drives narrow "skill" scripts (create/assign
   tasks, sprint reports, reminders). Also **mirrors a Discord forum into the bug
   tracker** on a schedule. Runs persistently on a host machine / small VPS, not on Vercel.

> Migrated from Firebase/Firestore to Supabase — see `MIGRATION_SUPABASE.md`. Legacy
> `firestore.rules` / `firebase.json` may still linger in the tree but are no longer used;
> security now lives in Postgres **RLS** (`supabase/migrations/`).

### App views (web)

Project is the entry gate (`ProjectSelect`); everything below is scoped to the selected project.

- **Bảng Sprint** (`SprintBoard`) — task list for the selected sprint, with a "+" create card.
- **Task của tôi** (`MyTasks`) — the current user's tasks as cards.
- **Features** (`Features`) — per-project feature cards; open one to see its tasks. Tasks
  attach to a feature (`tasks.feature_id`). A feature = đơn vị deliver được (gói bán);
  nhóm lớn (Shop…) và version delivery (1.2.0) là **nhãn** (`feature_labels` +
  `features.label_ids`) — lọc bằng chip. `features.kind`: `delivery` hiện % done,
  `ongoing` (Polish, tuning — không bao giờ xong) hiện nhịp 30 ngày thay vì %.
- **Backlog** (`Backlog`) — parked tasks: no sprint AND no assignee.
- **Bugs** (`Bugs`) — a bug tracker with a **Kanban** view (columns by status) and a
  **GitLab-style list**. Bugs carry freeform `bug_labels`; the Kanban column is derived
  from a workflow label (Fixing/Pending/Deployed/Done). A "+" filter builds token filters.
- **Timeline** (`Timeline`) — Gantt CẢ DỰ ÁN gộp theo feature (một hàng/feature, xổ ra
  task); khoảng thời gian chọn bằng `DateRangePicker` (bộ preset `TIMELINE_PRESETS`,
  `allowFuture` — khác tab Truy cập vốn khoá tương lai).
- **Thống kê / Quản lý Sprint / Thành viên / Cấu hình** — charts, admin.

### Discord bug sync (`bot/skills/bug_sync.py`)

Two-way sync between a Discord **forum channel** and `bugs`:
- **Discord → app** (daily 09:00 `Asia/Ho_Chi_Minh`, `@bot sync bug`, or the web "Sync
  Discord" button which queues `bug_sync_requests`): each post → a bug; forum tags →
  `bug_labels` (linked by `discord_tag_id`, icon mirrors the tag's emoji); starter-message
  images are re-uploaded to Storage (videos stay in-thread — see `bug_mirror_videos`).
- **app → Discord**: changing a bug's labels in-app sets `pending_discord_push`; the bot
  rewrites the thread's applied tags to match.
- Diagnostics: `python skills/bug_sync.py --estimate|--perms`.

### Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web framework | React 18 + Vite + TypeScript | `web/` — SPA, one component per file |
| Styling | CSS3 (vanilla) | `web/src/index.css` — glassmorphism dark theme, CSS custom properties. NO CSS framework. |
| Data / Auth | **Supabase** (Postgres + Auth + Storage + Realtime) | `web/src/supabase.ts`; Google sign-in. RLS enforces access. |
| Charts | Chart.js via `react-chartjs-2` (npm) | sprint burndown / stats |
| Fonts | Google Fonts (CDN) | **Inter only** — một font cho toàn app, không trộn họ chữ |
| Bot | Python 3.11+, `discord.py`, `supabase-py` | `bot/` — tag → Claude CLI → skills; + bug forum sync |
| Deploy | Vercel (web) + GitHub | bot self-hosted with a process manager / Task Scheduler |

### Design System

Premium Dark Theme — Glassmorphism. Full spec in `design_system_guide.md`.
- Background: `#0f172a` | Glass cards: `rgba(30,41,59,0.7)` + `backdrop-filter:blur(10px)`
- Accent Indigo: `#6366f1` | Sky: `#38bdf8` | Gold: `#fbbf24` | Text: `#f8fafc` / `#94a3b8`
- Fonts: **Inter cho MỌI thứ** — một font duy nhất, phân cấp bằng weight/size/color chứ
  không bằng đổi họ chữ. Số liệu dùng `.mono` (= `tabular-nums`, vẫn Inter). Nguồn sự thật:
  `--font-ui` trong `index.css`; weight nào CSS dùng thì `index.html` phải tải weight đó;
  canvas/Chart.js phải ép qua `lib/chartTheme.ts`.
- Active nav = **solid `#6366f1` fill + glow**, not a tint. Tab switch = fadeIn + translateY.

## Coding Standards

### SOLID Principles

**Single Responsibility** — One class/function, one job. If a file exceeds ~200 lines, split it. Names must reflect exact purpose.

**Open/Closed** — Open for extension, closed for modification. Add new behavior by creating new classes/hooks, not editing existing ones.

**Liskov Substitution** — Subtypes must be substitutable for their base. Prefer composition over inheritance.

**Interface Segregation** — Small, focused interfaces (3–5 methods max). Don't force a class to implement what it doesn't use.

**Dependency Inversion** — Depend on abstractions, not concretions. Inject dependencies via constructor or props; never hardcode.

### Design Patterns

Use patterns when they solve a real problem, not by default.

| Pattern | When to use |
|---------|------------|
| **Factory** | Creating objects without exposing init logic |
| **Builder** | Objects with >4 optional params |
| **Singleton** | Only for truly global resources (DB, logger) |
| **Adapter** | Integrating 3rd-party or legacy code |
| **Facade** | Simplifying a complex subsystem |
| **Repository** | Separating data access from business logic |
| **Strategy** | Swappable algorithms |
| **Observer** | Event-driven / reactive patterns |
| **State** | Object behavior changes based on internal state |

### Functions

- Max **20–30 lines** per function
- Max **3–4 parameters** — use an options object if more are needed
- Single level of abstraction per function
- **Early return** / guard clauses at the top to avoid deep nesting
- Pure logic separated from side effects (makes testing easy)

### Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Components / Classes | PascalCase, noun | `ProjectSelector`, `TaskRepository` |
| Functions / methods | camelCase, verb | `getTasksByWeek`, `handleImport` |
| Variables | camelCase, descriptive | `activeProjectId`, `taskCount` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_BATCH_SIZE` |
| Booleans | `is/has/can/should` prefix | `isLoading`, `hasPermission` |

**Data-layer naming boundary**: Postgres columns are **snake_case**; app types are
**camelCase**. Cross only in `web/src/lib/mappers.ts` (`rowToTask`, `taskPatchToRow`, …)
and the bot's `skills/task_repo.py`. Hooks/writes stay camelCase.

### File Structure

Monorepo — web app and bot are separate, self-contained folders. Never mix bot
secrets/service-role keys into `web/`, and never import web code from `bot/`.

```
bot-work-tracker/
├── web/                    # React + Vite + TS SPA  → Vercel
│   ├── src/
│   │   ├── contexts/       #   AuthContext, SprintContext, NotifyContext
│   │   ├── hooks/          #   useLiveQuery (fetch+subscribe), useTasks/Sprints/
│   │   │                   #   Members/Projects/Features/Bugs/BugLabels/Activity…
│   │   ├── components/     #   one component per file; task/ and bug/ subfolders
│   │   ├── lib/            #   mappers, *Writes (task/project/feature/bug…), pure
│   │   │                   #   helpers (sprint, format, bugStatus, discordLink…)
│   │   ├── types.ts        #   All TypeScript interfaces/types
│   │   ├── supabase.ts     #   Supabase client init (VITE_SUPABASE_* — client-safe)
│   │   └── App.tsx         #   Routing/provider shell only
│   ├── .env.example        #   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
│   └── vercel.json
├── bot/                    # Python discord.py + supabase-py (self-hosted)
│   ├── bot.py              #   tag → Claude CLI → skills; bug-sync loops
│   ├── hints.py            #   "API docs" of the skill set, injected into Claude's prompt
│   ├── supabase_client.py  #   supabase-py init (service-role key, bypasses RLS)
│   ├── skills/             #   *_ops = CLI Claude runs; *_repo = data access; both split
│   │                       #   by domain: task_ops/task_repo, feature_ops + project_ops/
│   │                       #   project_repo, sprint_ops, sprint_report, reminder,
│   │                       #   permissions (admin gate), errors, constants,
│   │                       #   task_title (làm sạch tiêu đề — chặn ở code, không chỉ hint),
│   │                       #   attachments (URL → attachment; song song web/src/lib/attachments.ts),
│   │                       #   bug_sync (Discord forum ↔ bugs), doc_* (RAG),
│   │                       #   release_sync (sheet Timeline → feature_labels.release_date),
│   │                       #   member_dm (DM điểm tuần cho member — thứ 5 + test từ web)
│   ├── settings.json       #   model, allowed users, channels, bug_forums
│   └── .env.example        #   DISCORD_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
├── supabase/
│   ├── migrations/         # 0001_init … — schema + RLS + realtime (SOURCE OF TRUTH)
│   └── migrate_from_firestore.py
└── DATA_MODEL.md           # Shared schema (source of truth for web + bot)
```

### Comments

- Comment **why**, not what — code should be self-documenting
- JSDoc for exported functions and hooks
- TODO comments must include a ticket/phase reference: `// TODO(Phase 3): add image deletion`

---

## Performance

- **No object creation inside loops** — extract outside or memoize
- **Cleanup Realtime channels** — `useLiveQuery` returns `supabase.removeChannel(channel)`
  in its `useEffect` cleanup; any manual `.channel()` subscription MUST be removed on
  unmount or it leaks a socket.
- **`useMemo`/`useCallback`** for derived state and stable callbacks passed to children.
  A `useLiveQuery` `fetcher` must be `useCallback`-stable per its `deps`.
- **Prefer one query shape** — `useLiveQuery` refetches on any table change (RLS-filtered);
  fine for these row counts. Add a Postgres `filter` to scope the realtime channel.
- **Batch bulk writes** — one `.insert([...])` / `.upsert([...])` call, not a loop.
- **Pagination** for lists that can grow unboundedly.

---

## Error Handling

- Validate inputs early (fail fast)
- Never silently swallow errors — log with full context
- Custom error types for domain errors (import failure, permission denied)
- Show user-facing messages for expected failures; log full stack for unexpected ones
- Supabase calls return `{ data, error }` — **always check `error` and throw/handle**; do
  not assume `data` is populated. Notion / Discord side-syncs are fire-and-forget (Postgres
  is the source of truth if they fail).

---

## Supabase-Specific Rules

- **Client config is public by design** — `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  ship in the browser bundle; access is gated by **RLS + Auth**, not by hiding them. Never
  put the service-role key or bot token in `web/`.
- **The bot uses the `service_role` key** — it **bypasses RLS**, so enforce every
  permission check in bot code. Keep it out of git (`.gitignore` → `bot/.env`) and off Vercel.
  Every skill that WRITES must gate on `skills/permissions.py` first: creating a task is open
  to all (mirrors `tasks_insert`), **everything else is admin-only** — deliberately stricter
  than RLS, which also lets a task's reporter/assignee edit it. Identity comes from
  `BOT_SENDER_ID` (the real Discord author id, set by `bot.py`) matched **exactly** against
  `profiles.discord_id` — never from message text, and never fuzzy-matched on display name.
  An admin with no `discord_id` linked cannot use admin skills: that is fail-closed, by design.
- **Security lives in migrations** — never ship a new query shape without the matching RLS
  policy. Add a `supabase/migrations/00NN_*.sql` file **and** apply it (Supabase MCP
  `apply_migration` or CLI). Run `get_advisors` after DDL. `SECURITY DEFINER` functions
  must `revoke execute … from public, anon, authenticated` unless meant to be called.
- **`DATA_MODEL.md` is the single source of truth** for table/field names shared by web and
  bot. Change it there first, then both sides (mappers + `task_repo.py`).
- **Reset state to `[]`** synchronously when the scope (e.g. `selectedSprintId`) changes,
  before new listeners attach (`useLiveQuery` handles this via `deps`).
- **Storage**: uploaded media lives in the public `attachments` bucket (`task-attachments/`,
  `bug-attachments/`). Discord CDN URLs expire, so the bot re-uploads to Storage.

---

## Response Format

When implementing:
1. State the chosen approach and pattern briefly
2. Highlight important decisions in code comments
3. Call out performance concerns if any
4. Suggest alternatives when a simpler solution exists
