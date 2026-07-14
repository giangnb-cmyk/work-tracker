# Migration: Firebase → Supabase

Branch: `migrate/supabase`. Target: **Supabase Auth (Google) + Postgres + Storage + Realtime**,
migrate existing Firestore data, migrate the Python bot too.

> Firebase stays wired until each stage cuts over, so `main` remains deployable throughout.

## Decisions (confirmed)
- **Auth** → Supabase Auth with Google OAuth (replaces Firebase Auth).
- **Data** → migrate `users/sprints/projects/tasks/notifications/config` into Postgres.
- **Bot** → move from `firebase-admin` to `supabase-py`.

## Field naming
Postgres columns are `snake_case`; the app/types use `camelCase`. Each data-layer module
maps between them (e.g. `dueStart ↔ due_start`, `notionPageId ↔ notion_page_id`). Firestore
doc ids (string) become Postgres `uuid`; auth uids become `auth.users.id` (uuid).

## Stages

### 0. Setup — DONE
- [x] Add Supabase MCP (`.mcp.json`), install agent skills.
- [x] Branch `migrate/supabase`.
- [x] Schema + RLS drafted: `supabase/migrations/0001_init.sql`.
- [x] `@supabase/supabase-js` pinned in `web/`.

### 1. Provision DB — **BLOCKED on you: authenticate MCP** (`claude /mcp` → supabase → Authenticate)
- [ ] Apply `0001_init.sql` via MCP `execute_sql`.
- [ ] Run `get_advisors` (security/perf) and fix findings.
- [ ] Enable Google provider in Supabase Auth; set redirect URLs.
- [ ] Configure the sign-in allowlist enforcement (email/domain) as today.

### 2. Web auth cutover
- [ ] `web/src/supabase.ts` — client from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- [ ] Rewrite `AuthContext` → `supabase.auth.signInWithOAuth({ provider: 'google' })`,
      `onAuthStateChange`, profile from `public.profiles`.
- [ ] Replace `RolePicker`/allowlist logic against the new profile.

### 3. Web data layer
- [ ] Replace `onSnapshot` hooks with Supabase Realtime channels
      (`useTasks/useMyTasks/useProjects/useMembers/useSprints/useNotifications/useProjectTasks`).
- [ ] Replace writes (`taskWrites/memberWrites/projectWrites/accessConfig`) with `supabase.from(...)`.
- [ ] Storage: Firebase Storage → Supabase Storage (attachments).
- [ ] Delete Firebase SDK usage; update `vite.config.ts` manualChunks.

### 4. Notion gateway + bot
- [ ] `web/api/_auth.ts` — verify **Supabase JWT** instead of Firebase ID token
      (keep the `x-sync-secret` path for the bot).
- [ ] Bot: `firebase_client.py` → supabase-py; skills read/write Postgres.

### 5. Data migration
- [ ] Script: export Firestore → transform (ids→uuid map, camel→snake) → insert into Postgres.
- [ ] Backfill `auth.users` for existing members (invite or map on first Google login).
- [ ] Verify counts per table; spot-check tasks/notifications.

### 6. Cutover & cleanup
- [ ] Point Vercel env at Supabase; remove Firebase env.
- [ ] Remove `firebase`, `firebase-admin`, rules/indexes files no longer used.
- [ ] Update `CLAUDE.md`, `DATA_MODEL.md`, `README.md`.

## Rollback
Everything is on `migrate/supabase`; `main` keeps Firebase. If a stage fails, stay on `main`.
