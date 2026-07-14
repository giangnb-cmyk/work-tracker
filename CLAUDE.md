# CLAUDE.md

## Project Context

**Bot Work Tracker** — a sprint & task management app for a software team.

Two deliverables share one Firebase project (Auth + Cloud Firestore):

1. **`web/`** — React + Vite + TypeScript single-page app. Team members sign in with
   Google, manage sprints on a Kanban board, assign tasks, and view sprint dashboards.
   Deployed to **Vercel** as a static build from GitHub.
2. **`bot/`** — Python `discord.py` Discord bot backed by `firebase-admin`. Reads/writes
   the **same** Firestore data. Responds when tagged by delegating to the Claude CLI, which
   drives narrow "skill" scripts (create/assign tasks, sprint reports, reminders). Runs
   persistently on a host machine / small VPS, not on Vercel.

### Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web framework | React 18 + Vite + TypeScript | `web/` — SPA, one component per file |
| Styling | CSS3 (vanilla) | `web/src/index.css` — glassmorphism dark theme, CSS custom properties. NO CSS framework. |
| Data / Auth | Firebase (Firestore + Auth) | Web SDK v10 (`web/src/firebase.ts`); Google sign-in |
| Charts | Chart.js via `react-chartjs-2` (npm) | sprint burndown / stats |
| Fonts | Google Fonts (CDN) | Outfit, Inter, JetBrains Mono |
| Bot | Python 3.11+, `discord.py`, `firebase-admin` | `bot/` — tag → Claude CLI → skill scripts |
| Deploy | Vercel (web) + GitHub | bot self-hosted with a process manager / Task Scheduler |

### Design System

Premium Dark Theme — Glassmorphism. Full spec in `design_system_guide.md`.
- Background: `#0f172a` | Glass cards: `rgba(30,41,59,0.7)` + `backdrop-filter:blur(10px)`
- Accent Indigo: `#6366f1` | Sky: `#38bdf8` | Gold: `#fbbf24` | Text: `#f8fafc` / `#94a3b8`
- Fonts: Outfit (headings) · Inter (body) · JetBrains Mono (numbers/IDs)
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

### File Structure

Monorepo — web app and bot are separate, self-contained folders. Never mix bot
secrets/service-account keys into `web/`, and never import web code from `bot/`.

```
bot-work-tracker/
├── web/                    # React + Vite + TS SPA  → Vercel
│   ├── src/
│   │   ├── contexts/       #   AuthContext, SprintContext
│   │   ├── hooks/          #   useSprints, useTasks, useMembers
│   │   ├── components/     #   UI components (one component per file)
│   │   ├── lib/            #   pure helpers (sprint math, formatting)
│   │   ├── types.ts        #   All TypeScript interfaces/types
│   │   ├── firebase.ts     #   Firebase init and exports
│   │   └── App.tsx         #   Routing/provider shell only
│   ├── .env.example        #   VITE_FIREBASE_* keys (client-safe)
│   └── vercel.json
├── bot/                    # Python discord.py + firebase-admin (self-hosted)
│   ├── bot.py              #   tag → Claude CLI → skills
│   ├── firebase_client.py  #   firebase-admin init (service account)
│   ├── skills/             #   task_ops.py, sprint_report.py, reminder.py
│   ├── settings.json       #   model, allowed users, channels
│   └── .env.example        #   DISCORD_TOKEN, GOOGLE_APPLICATION_CREDENTIALS
├── firestore.rules         # Security rules — deploy WITH code changes
├── firebase.json
└── DATA_MODEL.md           # Shared Firestore schema (source of truth for web + bot)
```

### Comments

- Comment **why**, not what — code should be self-documenting
- JSDoc for exported functions and hooks
- TODO comments must include a ticket/phase reference: `// TODO(Phase 3): add image deletion`

---

## Performance

- **No object creation inside loops** — extract outside or memoize
- **Cleanup `onSnapshot` listeners** — always `return unsub` in `useEffect`; missing cleanup = Firestore cost leak
- **`useMemo`/`useCallback`** for derived state and stable callbacks passed to children
- **Batch Firestore writes** — use `writeBatch` for bulk operations; max 499 ops per batch
- **Pagination** for lists that can grow unboundedly

---

## Error Handling

- Validate inputs early (fail fast)
- Never silently swallow errors — log with full context
- Custom error types for domain errors (import failure, permission denied)
- Show user-facing messages for expected failures; log full stack for unexpected ones

---

## Firebase-Specific Rules

- **Client Firebase config is public by design** — the `VITE_FIREBASE_*` values ship in the
  browser bundle; that is expected. Access is gated by Firestore **security rules + Auth**, not
  by hiding the config. Never put a service-account key or bot token in `web/`.
- **The bot uses a service-account key** (`firebase-admin`) which bypasses security rules —
  keep it out of git (`.gitignore`) and off Vercel. Enforce bot-side permission checks in code.
- **Security rules deploy with code** — never ship a new query shape without updating
  `firestore.rules`; keep the rules in sync with `DATA_MODEL.md`.
- **`DATA_MODEL.md` is the single source of truth** for collection/field names shared by web
  and bot. Change it there first, then both sides.
- **Reset state to `[]`** synchronously when `activeSprintId` changes before new listeners attach
- **Cleanup `onSnapshot` listeners** — always `return unsub` in `useEffect`; missing cleanup = cost leak

---

## Response Format

When implementing:
1. State the chosen approach and pattern briefly
2. Highlight important decisions in code comments
3. Call out performance concerns if any
4. Suggest alternatives when a simpler solution exists
