# Bot Work Tracker

Ứng dụng quản lý **sprint / task / bug** cho team phần mềm. Tất cả dùng chung một **Supabase** project (Postgres + Auth + Storage + Realtime):

| Phần | Công nghệ | Vai trò |
|------|-----------|---------|
| **`web/`** | React + Vite + TypeScript + Supabase | SPA: đăng nhập Google, bảng sprint, task/bug, Features, Timeline, thống kê. Deploy **Vercel**. |
| **`web/api/`** | Vercel Serverless Functions | Cổng đồng bộ **Notion** (token giữ phía server). |
| **`web/android/` + `web/ios/`** | **Capacitor 8** | App mobile bọc chính bundle web — xem mục 4. |
| **`bot/`** | Python 3.11+ `discord.py` + `supabase-py` | Bot Discord: tạo/giao task qua Claude CLI, báo cáo sprint, nhắc nhở, **sync forum bug Discord ↔ bug tracker**. Self-host. |
| **`supabase/`** | SQL migrations + Edge Functions | **Nguồn sự thật** của schema + RLS. |

Tài liệu đi kèm: **[DATA_MODEL.md](DATA_MODEL.md)** (schema chung web+bot) · **[CLAUDE.md](CLAUDE.md)** (chuẩn code) · **[design_system_guide.md](design_system_guide.md)** (theme) · **[MIGRATION_SUPABASE.md](MIGRATION_SUPABASE.md)** (lịch sử chuyển từ Firebase — file `firestore.rules`/`firebase.json` còn sót trong cây là đồ cũ, KHÔNG dùng nữa).

```
work-tracker/
├── web/                 # React SPA + api/ (Vercel) + android/ + ios/ (Capacitor)
├── bot/                 # Discord bot (self-host) — chi tiết: bot/README.md
├── supabase/
│   ├── migrations/      # 0001_init … — schema + RLS + realtime (NGUỒN SỰ THẬT)
│   └── functions/       # Edge Functions (member-tasks — API cho app ngoài)
└── DATA_MODEL.md CLAUDE.md design_system_guide.md
```

---

## 1. Supabase (bắt buộc — web & bot dùng chung)

1. Tạo project tại <https://supabase.com/dashboard> (hoặc dùng project có sẵn — ref hiện tại: `vlsskdwcfcmyubyrtwhn`).
2. **Auth → Providers → Google**: bật, điền Client ID + Secret của một **OAuth Web client** tạo ở Google Cloud Console (Credentials). Web client này dùng lại được cho đăng nhập native mobile (mục 4) và nút Xuất Google Sheet.
3. **Áp migrations theo thứ tự** trong `supabase/migrations/` (chọn 1 cách):
   - Supabase CLI: `supabase link --project-ref <ref>` rồi `supabase db push`;
   - hoặc dán từng file vào **SQL Editor** theo số thứ tự tăng dần;
   - hoặc MCP `apply_migration` nếu phiên Claude Code có tool.
   Migrations tạo đủ bảng + **RLS** + realtime + bucket Storage `attachments`. Sau DDL nên chạy advisor kiểm tra.
4. **Auth → URL Configuration**: Site URL = domain web production (vd `https://m-plan.easygoing.vn`), thêm `https://<domain>/**` (+ `http://localhost:5173/**` khi dev) vào Redirect URLs.
5. **Admin đầu tiên**: đăng nhập web một lần (tạo row `profiles`), rồi vào Table Editor sửa `profiles.role` = `'admin'` (hoặc `'owner'`).
6. **Allowlist đăng nhập**: admin vào tab **Cấu hình** trên web thêm email/domain được phép. Danh sách trống = ai cũng vào được (chỉ để admin đầu tiên khởi tạo).

Lấy key tại **Project Settings → API**: `anon` key cho web (public by design — bảo vệ bằng RLS), `service_role` key **CHỈ** cho bot (bypass RLS — tuyệt đối không đưa vào `web/` hay Vercel).

---

## 2. Web app (`web/`)

> ⚠️ Repo là monorepo — **mọi lệnh npm chạy trong `web/`**, không phải thư mục gốc.

```bash
cd web
npm install
cp .env.example .env.local     # điền VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                    # http://localhost:5173
```

Build production: `npm run build` (chạy kèm typecheck) → `web/dist/`.

### Deploy Vercel

1. Import repo GitHub vào Vercel — **remote hiện tại: `janreng/work-tracker`** (đổi từ 2026-08-15; nếu Vercel còn nối repo cũ thì đổi ở Project Settings → Git).
2. **Root Directory = `web`** (quan trọng). Preset Vite, output `dist` (đã có `vercel.json`).
3. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ tuỳ chọn: `VITE_ALLOWED_EMAIL_DOMAIN`, `VITE_APP_URL`, `VITE_GOOGLE_CLIENT_ID`, và các biến Notion ở mục 5). ⚠️ Biến `VITE_*` nhúng lúc **build** — thêm/đổi xong phải **Redeploy**.

### Responsive mobile

Web đã responsive cho điện thoại (bottom tab bar, modal dạng bottom sheet, kanban vuốt từng cột). Toàn bộ nằm trong khối `MOBILE` cuối `web/src/index.css` + component `MobileNav.tsx`. Quy tắc và pitfalls khi sửa tiếp: skill `mobile-responsive-web`.

---

## 3. Discord bot (`bot/`)

Chạy nền trên máy/VPS Windows (không deploy Vercel). Chi tiết: **[bot/README.md](bot/README.md)**. Tóm tắt:

1. Tạo Discord app + bot token (bật **Message Content Intent**).
2. `cd bot && pip install -r requirements.txt` (Python 3.11+).
3. `cp .env.example .env` rồi điền: `DISCORD_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (bắt buộc); `WEB_BASE_URL`, `DISCORD_WEBHOOK_URL`, RAG/Ollama (tuỳ chọn — xem comment trong file).
4. Cài **Claude CLI** (`claude` phải gọi được từ PATH, hoặc đặt `CLAUDE_CMD`).
5. `settings.json`: model, user/channel được phép, `bug_forums` (forum Discord ↔ bug tracker), lịch weekly report / member DM / standup… (mỗi mục có `_note_*` giải thích ngay trong file).
6. Chạy: `run-bot-safe.bat` (tự restart khi crash). Nhắc nhở/standup theo lịch: Windows Task Scheduler chạy `run-reminder.bat` / `run-standup.bat`.

Bot hiểu tiếng Việt khi được tag: `@bot tạo task "Fix màn login" cho @Nam sprint active, hạn 2026-08-20` · `@bot báo cáo sprint` · `@bot sync bug`. **Phân quyền trong code bot** (`skills/permissions.py`): tạo task mở cho mọi người, còn lại admin-only, định danh qua `profiles.discord_id` khớp chính xác.

---

## 4. App mobile Android / iOS (Capacitor)

App mobile = chính bundle `web/dist/` bọc trong Capacitor — **appId: `com.mio.app.manager`** (đã publish store thì không đổi được nữa). Chi tiết quy trình + gotchas: skill `port-web-to-mobile-app`.

### Yêu cầu máy build

- Node 22+, **JDK 21** (JDK 17 sẽ lỗi `invalid source release: 21`) — trỏ qua `~/.gradle/gradle.properties`: `org.gradle.java.home=<path JDK21>`.
- Android SDK (platform 36) — khai trong `web/android/local.properties`: `sdk.dir=<path SDK>` (file này gitignore, mỗi máy tự tạo).
- iOS: bắt buộc **macOS + Xcode** — `npx cap open ios`, set team/bundle rồi build; phát hành qua skill `upload-app-store-connect`.

### Build Android

```bash
cd web
npm run build && npx cap sync          # mỗi lần đổi code web
cd android && ./gradlew assembleDebug  # APK: app/build/outputs/apk/debug/app-debug.apk
```

AAB phát hành: `./gradlew bundleRelease` (cần signingConfig — xem skill `upload-google-play`).

### Đăng nhập Google trong app (bắt buộc cấu hình 1 lần)

Google **chặn OAuth trong webview**, nên app dùng đăng nhập native (`signInWithIdToken`). Cần:

1. Google Cloud Console (cùng project với Web client của Supabase) → tạo OAuth client **type Android**: package `com.mio.app.manager`, SHA-1 lấy từ `cd web/android && ./gradlew signingReport` (thêm cả debug lẫn release).
2. `web/.env.local`: đặt `VITE_GOOGLE_WEB_CLIENT_ID` = Web client ID trong Supabase → Auth → Providers → Google (bỏ trống thì fallback `VITE_GOOGLE_CLIENT_ID`), rồi build lại app.
3. iOS thêm OAuth client **type iOS** + reversed client ID vào URL Types của Info.plist.

Dev live-reload trên máy thật: thêm tạm `server: { url: 'http://<ip-lan>:5173', cleartext: true }` vào `capacitor.config.ts` + `vite --host` + `npx cap sync` — **GỠ trước khi build phát hành**.

---

## 5. Đồng bộ Notion (tuỳ chọn)

Tạo/đổi trạng thái task tự đồng bộ sang một database Notion, qua cổng duy nhất `web/api/notion.ts` — token Notion chỉ ở server. Chuẩn bị: tạo integration (<https://www.notion.so/my-integrations>), share database cho integration, lấy Database ID. Env đặt ở Vercel: `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `SUPABASE_URL` + `SUPABASE_ANON_KEY` (verify JWT — KHÔNG dùng service_role), `NOTION_SYNC_SECRET` (bí mật tự đặt, trùng với `bot/.env`), và các `NOTION_PROP_*`/`NOTION_STATUS_MAP` nếu tên cột khác mặc định — danh sách đầy đủ trong `web/.env.example`. Chưa cấu hình thì mọi thứ vẫn chạy, chỉ là không sync Notion.

---

## 6. CodeGraph (tuỳ chọn — cho dev)

Repo được index bằng CodeGraph để tra cứu code nhanh. `.codegraph/` là index cục bộ (gitignore). Sau khi clone: `codegraph init` (lần đầu) / `codegraph sync` (sau khi sửa code).

---

## Bảo mật

- **Không commit**: `.env*`, key service account, token Discord/Notion (đã gitignore).
- `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` là **công khai theo thiết kế** — chặn truy cập bằng **RLS + Auth**, không phải bằng giấu key.
- `service_role` key **bypass RLS** → chỉ nằm ở `bot/.env` trên máy chạy bot; mọi kiểm tra quyền của bot nằm trong code (`skills/permissions.py`).
- Đổi schema/query mới = thêm migration `supabase/migrations/00NN_*.sql` kèm RLS tương ứng — xem quy tắc trong [CLAUDE.md](CLAUDE.md).
