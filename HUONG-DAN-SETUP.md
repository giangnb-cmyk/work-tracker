# Hướng dẫn setup — máy mới từ zero đến chạy được

Runbook dựng **work-tracker** trên máy mới, làm theo thứ tự từ trên xuống. Bản HTML dễ đọc:
mở [HUONG-DAN-SETUP.html](HUONG-DAN-SETUP.html) bằng trình duyệt.

> Hệ thống có 3 phần: **Supabase** (data + auth, cloud, dùng chung), **Web** (Vercel),
> **Bot Discord** (self-host trên MỘT máy). Ba phần nối nhau bằng các biến môi trường
> — sơ đồ:
>
> ```
> web/.env.local  ──anon key──►  SUPABASE  ◄──service_role key── bot/.env
> Vercel env      ──anon key──►  (RLS + Auth)
> Vercel env  ◄──NOTION_SYNC_SECRET (trùng nhau)──►  bot/.env
> Vercel env  ──NOTION_TOKEN──►  Notion
> ```

---

## 0. Cài phần mềm

Chạy được trên cả **Windows** lẫn **macOS** (code web + bot đều cross-platform; script
chạy bot có 2 bản: `.bat` cho Windows, `.sh` cho macOS/Linux).

| Phần mềm | Windows | macOS | Cần cho | Kiểm tra |
|---|---|---|---|---|
| Node.js 22.x | `winget install OpenJS.NodeJS.LTS` | `brew install node@22` | web | `node -v` → v22.x |
| Git | `winget install Git.Git` | có sẵn (Xcode CLT) | tất cả | `git --version` |
| Python 3.11+ | `winget install Python.Python.3.11` | `brew install python@3.11` | bot | `python --version` / `python3 --version` |
| Claude CLI | <https://claude.com/claude-code>, cài xong chạy `claude` đăng nhập 1 lần | như Windows | bot | `claude --version` |
| Ollama + bge-m3 | `winget install Ollama.Ollama` → `ollama pull bge-m3` | `brew install ollama` → `ollama pull bge-m3` | bot (RAG — tuỳ chọn) | `ollama list` |
| JDK 21 + Android SDK 36 | chỉ khi build app mobile — README §4 | `brew install openjdk@21` + Android Studio | mobile | `./gradlew -v` |
| Xcode | — | chỉ khi build app **iOS** (bắt buộc macOS) | mobile iOS | `xcodebuild -version` |

```bash
git clone https://github.com/janreng/work-tracker.git d:\AppProject\work-tracker
```

---

## 1. Supabase — nền của cả web lẫn bot

Project đang chạy: ref **`vlsskdwcfcmyubyrtwhn`** → URL `https://vlsskdwcfcmyubyrtwhn.supabase.co`.
**Máy mới nối vào project có sẵn thì chỉ cần làm bước 1.5 (lấy key)** — các bước còn lại
là khi dựng project MỚI từ đầu.

### 1.1. Tạo project + bật đăng nhập Google

1. <https://supabase.com/dashboard> → **New project** (nhớ region gần VN).
2. Tạo OAuth client cho đăng nhập Google — ở **Google Cloud Console → APIs & Credentials
   → Create Credentials → OAuth client ID → type Web application**:
   - *Authorized JavaScript origins*: `https://m-plan.easygoing.vn`, `http://localhost:5173`,
     domain vercel (`https://<app>.vercel.app`).
   - *Authorized redirect URIs*: `https://<ref>.supabase.co/auth/v1/callback`.
   - Copy **Client ID** + **Client Secret**.
3. Supabase → **Authentication → Providers → Google**: bật, dán Client ID + Secret.

### 1.2. Áp schema (migrations)

Nguồn sự thật của schema + RLS là `supabase/migrations/` (đánh số tăng dần). Chọn 1 cách:

```bash
# Cách 1 — Supabase CLI (khuyên dùng)
supabase link --project-ref <ref>
supabase db push

# Cách 2 — dán từng file vào Dashboard → SQL Editor, theo số thứ tự 0001, 0002…
```

Migrations tạo đủ bảng + RLS + realtime + bucket Storage `attachments`.

### 1.3. Redirect URLs

**Authentication → URL Configuration**:
- *Site URL* = domain production, vd `https://m-plan.easygoing.vn`
- *Redirect URLs*: thêm `https://<domain>/**` và `http://localhost:5173/**` (khi dev).

Thiếu bước này = đăng nhập xong bị đá về trang trắng.

### 1.4. Admin đầu tiên + allowlist

1. Mở web, đăng nhập Google 1 lần (tự tạo row trong `profiles`).
2. Dashboard → **Table Editor → profiles** → sửa `role` = `'admin'` (hoặc `'owner'`).
3. Vào web → tab **Cấu hình** → thêm email/domain được phép đăng nhập.
   Danh sách trống = ai cũng vào được (chỉ để trống lúc khởi tạo).

### 1.5. Lấy 2 key (Dashboard → Project Settings → API)

| Key | Dùng ở | Tính chất |
|---|---|---|
| `anon` key | `web/.env.local`, Vercel env | **Công khai theo thiết kế** — bảo vệ bằng RLS, không phải bằng giấu key |
| `service_role` key | **CHỈ** `bot/.env` | **BYPASS toàn bộ RLS.** Không bao giờ đưa vào web/, Vercel, hay commit |

---

## 2. Web chạy local (`web/.env.local`)

```bash
cd web
npm install
copy .env.example .env.local     # macOS: cp .env.example .env.local
npm run dev                      # http://localhost:5173
```

Từng biến trong `.env.local` (chỉ 2 biến đầu là bắt buộc để chạy):

| Biến | Bắt buộc | Giá trị / lấy ở đâu |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | `https://vlsskdwcfcmyubyrtwhn.supabase.co` (có sẵn trong .env.example) |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase → Project Settings → API → `anon` key |
| `VITE_ALLOWED_EMAIL_DOMAIN` | ⬜ | Chặn domain email dự phòng, CHỈ có tác dụng khi allowlist (tab Cấu hình) còn trống. Bỏ trống = không chặn |
| `VITE_APP_URL` | ⬜ | Domain dựng link chia sẻ tuyệt đối (link task `/t/<mã>` dán Discord). Trống = dùng mặc định trong code (`https://m-plan.easygoing.vn`) |
| `VITE_GOOGLE_CLIENT_ID` | ⬜ | OAuth **Web** client ID (mục 1.1) — cho nút "Xuất Google Sheet" tab Chi phí. Trống = nút báo thiếu cấu hình |
| `VITE_GOOGLE_WEB_CLIENT_ID` | ⬜ | Cho đăng nhập Google **native trong app mobile**. Trống = fallback sang `VITE_GOOGLE_CLIENT_ID` |

> ⚠️ Biến `VITE_*` **nhúng vào bundle lúc build** — trên Vercel đổi giá trị xong phải
> **Redeploy** mới ăn. Local thì restart `npm run dev`.

---

## 3. Vercel — deploy web + cổng API

### 3.1. Nối repo

1. <https://vercel.com> → **Add New → Project** → import repo GitHub **`janreng/work-tracker`**.
2. **Root Directory = `web`** ← quan trọng nhất, sai là build fail.
3. Framework preset: **Vite** (tự nhận), output `dist` (đã có `web/vercel.json`).
4. Domain: gắn `m-plan.easygoing.vn` (Project Settings → Domains) — nhớ domain này phải
   nằm trong Redirect URLs của Supabase (mục 1.3).

### 3.2. Environment Variables (Project Settings → Environment Variables)

**Nhóm client (VITE_ — vào bundle browser):** đặt giống hệt mục 2:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ tuỳ chọn `VITE_ALLOWED_EMAIL_DOMAIN`,
`VITE_APP_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_WEB_CLIENT_ID`).

**Nhóm server (cho serverless `web/api/*` — KHÔNG lộ ra browser):**

| Biến | Bắt buộc | Ý nghĩa / lấy ở đâu |
|---|---|---|
| `SUPABASE_URL` | ✅* | Giống `VITE_SUPABASE_URL` — để `/api` verify JWT của user gửi lên |
| `SUPABASE_ANON_KEY` | ✅* | **Anon key** (KHÔNG phải service_role — service_role cấm lên Vercel) |
| `NOTION_SYNC_SECRET` | ⬜ | Chuỗi bí mật tự đặt — bot dùng để gọi cổng Notion. **Phải trùng** `NOTION_SYNC_SECRET` trong `bot/.env` |
| `DISCORD_WEBHOOK_URL` | ⬜ | Webhook kênh Discord nhận thông báo "task hoàn thành" từ web. Discord → Channel Settings → Integrations → Webhooks |

\* bắt buộc nếu dùng bất kỳ tính năng `/api` nào (Notion, notify) — không dùng thì bỏ qua cả nhóm.

**Nhóm Notion (tuỳ chọn — chỉ khi bật đồng bộ Notion, xem mục 6):**

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `NOTION_TOKEN` | — | Token integration: <https://www.notion.so/my-integrations> → New integration → copy **Internal Integration Secret** |
| `NOTION_DATABASE_ID` | — | ID database Tasks trên Notion (chuỗi 32 ký tự trong URL của database) |
| `NOTION_PROP_TITLE` | `Name` | Tên cột title trong Notion DB |
| `NOTION_PROP_STATUS` | `Status` | Cột trạng thái. `NOTION_STATUS_TYPE` = `status` hoặc `select` tuỳ kiểu cột |
| `NOTION_PROP_ASSIGNEE` | `Assignee` | Cột người nhận. `NOTION_ASSIGNEE_TYPE` = `rich_text` hoặc `people` |
| `NOTION_PROP_DUE` | `Due` | Cột hạn (kiểu date) |
| `NOTION_PROP_PRIORITY` | `Priority` | Cột ưu tiên. Đặt `''` (rỗng) để TẮT nếu DB không có cột này |
| `NOTION_PROP_DESCRIPTION` | *(tắt)* | Cột mô tả (rich_text). **Chỉ điền khi DB thật sự có cột** — điền bừa là MỌI lần sync lỗi |
| `NOTION_STATUS_MAP` / `NOTION_PRIORITY_MAP` | mặc định trong `web/api/_notion.ts` | JSON ánh xạ giá trị app → tên lựa chọn Notion, vd `{"todo":"Todo","in_progress":"In progress"}` |
| `NOTION_PROJECTS_DB_ID` | — | ID database **Projects** trên Notion — để dropdown "Liên kết Notion project" trong Cấu hình project có dữ liệu |
| `NOTION_PROP_PROJECT` | `Project` | Tên cột relation Project trên Tasks DB |

### 3.3. Sau khi đặt env

Bấm **Redeploy** (Deployments → ⋯ → Redeploy). Push code lên GitHub là tự deploy tiếp.

---

## 4. Bot Discord (`bot/.env` + `settings.json`) — chỉ trên MỘT máy

### 4.1. Tạo Discord app

1. <https://discord.com/developers/applications> → **New Application** → tab **Bot**.
2. **Reset Token** → copy (dán vào `.env` bước dưới).
3. Bật **MESSAGE CONTENT INTENT** (bắt buộc — bot đọc nội dung khi được tag).
4. Tab **OAuth2 → URL Generator**: scope `bot`, quyền `Send Messages`, `Read Message History`,
   `Manage Threads`, `Manage Channels`, `Create Posts` (3 quyền sau cho sync bug forum) →
   mở URL, mời bot vào server.

### 4.2. Cài + điền `.env`

```bash
cd bot
pip install -r requirements.txt      # macOS: pip3 install -r requirements.txt
copy .env.example .env               # macOS: cp .env.example .env
```

| Biến | Bắt buộc | Ý nghĩa / lấy ở đâu |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Token bot (bước 4.1) |
| `SUPABASE_URL` | ✅ | `https://vlsskdwcfcmyubyrtwhn.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Project Settings → API → `service_role`. **Bí mật tuyệt đối** |
| `CLAUDE_CMD` | ⬜ | Lệnh gọi Claude CLI, mặc định `claude`. Đổi nếu binary ở path khác |
| `WEB_BASE_URL` | ⬜ | URL web production — bot gắn link mở task vào thông báo. Trống = thông báo không có link. KHÔNG dùng localhost |
| `DISCORD_WEBHOOK_URL` | ⬜ | Webhook kênh báo "task mới" (trùng webhook với Vercel là cùng 1 kênh). Trống = không báo |
| `OLLAMA_HOST` | ⬜ | Mặc định `http://localhost:11434` — RAG tài liệu |
| `RAG_EMBED_MODEL` | ⬜ | Mặc định `bge-m3` (phải `ollama pull` trước) |
| `GDRIVE_SERVICE_ACCOUNT` | ⬜ | Path service account JSON; trống = mặc định `keys/service-account-gsheets.json` |
| `NOTION_GATEWAY_URL` | ⬜ | `https://<domain-web>/api/notion` — bot sync Notion qua cổng này |
| `NOTION_SYNC_SECRET` | ⬜ | **Phải trùng** biến cùng tên trên Vercel. Trống cả 2 biến Notion = bot bỏ qua sync (không lỗi) |

### 4.3. `settings.json` — nút cấu hình chính

File tự giải thích bằng các khoá `_note_*` ngay cạnh từng mục. Những mục phải đụng tới khi setup:

| Mục | Ý nghĩa |
|---|---|
| `model` / `effort` | Model Claude + mức suy luận (mặc định `claude-opus-4-8` / `medium`) |
| `reminder_channel_id`, `standup_channel_id`, `task_done_channel_id` | ID kênh Discord cho nhắc hạn / standup / báo task xong (bật Developer Mode → chuột phải kênh → Copy ID). `0` = tắt |
| `bug_forums[]` | Sync forum bug: `project_id` (uuid project trên web) + `forum_channel_id` + `notify_role` |
| `bypass_permissions` | Để `false` (run-bot-safe.bat ép false). Bật = Claude chạy lệnh không hỏi — nguy hiểm |
| `sheets_mcp_enabled` | Bot đọc Google Sheet (cần `uv` + service account — xem `bot/GOOGLE_SHEETS_MCP.md`) |
| `rag_sync_enabled`, `rag_drive_skip`, `rag_member_*` | Kho RAG tài liệu + giới hạn member |
| `weekly_report_enabled`, `weekly_mail`, `member_dm`, `member_review` | Báo cáo tuần vào Sheet, mail draft Gmail, DM điểm tuần, đánh giá AI |

### 4.4. Chạy

**Windows:**

```bash
run-bot-safe.bat     # chạy + tự restart khi crash. GIỮ CỬA SỔ MỞ.
```

- Bật cùng Windows: `Win+R` → `shell:startup` → shortcut tới `run-bot-safe.bat`.
- Lịch tự động (Windows Task Scheduler → Start a program): `run-reminder.bat` (nhắc hạn,
  1 lần/ngày ~9h), `run-standup.bat` (standup, T2–T6 ~9h30).

**macOS / Linux:**

```bash
chmod +x *.sh        # một lần sau khi clone (nếu mất quyền thực thi)
./run-bot-safe.sh    # chạy + tự restart khi crash. GIỮ CỬA SỔ TERMINAL MỞ.
```

- Lịch tự động bằng cron — `crontab -e` rồi thêm (sửa path cho đúng máy):
  ```
  0  9 * * *   /path/to/work-tracker/bot/run-reminder.sh
  30 9 * * 1-5 /path/to/work-tracker/bot/run-standup.sh
  ```
- Bật cùng máy: System Settings → General → Login Items → thêm Terminal chạy
  `run-bot-safe.sh` (hoặc dựng LaunchAgent nếu cần chạy ẩn).
- Các script sync RAG cũng có bản `.sh`: `./sync-rag.sh`, `./sync-drive.sh`,
  `./sync-drive-content.sh`.

- ⚠️ Chỉ chạy bot ở **một** máy — 2 bot cùng token = xử lý trùng lệnh.

Test: `@bot báo cáo sprint` trong kênh cho phép → bot trả lời là xong.

---

## 5. Google service account (`keys/`) — cho Sheets/Drive/Gmail

Các file trong `keys/` bị gitignore — máy mới chép tay từ máy cũ, hoặc tạo lại:

| File | Dùng cho | Tạo lại thế nào |
|---|---|---|
| `service-account-gsheets.json` | Weekly report vào Sheet, xuất Chi phí, danh mục + ruột tài liệu Drive (RAG), GA4 | Google Cloud Console → IAM → Service Accounts → Create key (JSON). Bật **Sheets API + Drive API** (+ Analytics Data API nếu dùng GA4). **Share** folder Drive/Sheet đích cho email của SA (quyền Editor với sheet ghi) |
| `gmail-oauth-client.json` | Soạn mail weekly report từ template Gmail | Google Cloud Console → Credentials → OAuth client **type Desktop** |
| `gmail-token.json` | Token sau khi auth Gmail | Chạy `python skills/gmail_gateway.py --auth` một lần |

---

## 6. Đồng bộ Notion (tuỳ chọn)

1. <https://www.notion.so/my-integrations> → **New integration** → copy secret = `NOTION_TOKEN`.
2. Mở database Tasks trên Notion → ⋯ → **Connections** → add integration vừa tạo
   (làm tương tự với database Projects nếu dùng `NOTION_PROJECTS_DB_ID`).
3. Lấy Database ID: URL dạng `notion.so/<workspace>/<DB_ID>?v=...` — chuỗi 32 ký tự.
4. Điền nhóm env Notion trên **Vercel** (bảng ở mục 3.2) → Redeploy.
5. Bot muốn sync: điền `NOTION_GATEWAY_URL` + `NOTION_SYNC_SECRET` trong `bot/.env`.
6. Trên web: **Cấu hình project → "Liên kết Notion project"** chọn project Notion tương ứng.
   **Bỏ liên kết = project đó ẩn toàn bộ icon/nút Notion và không tự tạo page nữa.**

Không cấu hình gì = app vẫn chạy bình thường, chỉ không sync.

---

## 7. App mobile (tuỳ chọn — README §4)

```bash
cd web && npm run build && npx cap sync
cd android && ./gradlew assembleDebug     # APK debug
```

Cần: JDK 21 (`~/.gradle/gradle.properties` → `org.gradle.java.home`), Android SDK
(`web/android/local.properties` → `sdk.dir`), OAuth client **type Android**
(package `com.mio.app.manager` + SHA-1 từ `./gradlew signingReport`).

---

## 8. Checklist "app chạy được"

- [ ] Web local `npm run dev` → đăng nhập Google được, thấy danh sách project
- [ ] Vercel deploy xong → domain production đăng nhập được
- [ ] `@bot báo cáo sprint` → bot trả lời
- [ ] Tạo task trên web → kênh Discord nhận thông báo (nếu đặt webhook)
- [ ] Tạo task ở project có liên kết Notion → page Notion xuất hiện (nếu bật Notion)
- [ ] Task Scheduler chạy `run-reminder.bat` thử → tin nhắc xuất hiện đúng kênh

## 9. Lỗi hay gặp

| Hiện tượng | Xử lý |
|---|---|
| Web trắng trang / lỗi auth | Thiếu `VITE_SUPABASE_ANON_KEY`, hoặc domain chưa có trong Redirect URLs (mục 1.3) |
| Đăng nhập bị từ chối | Email chưa nằm trong allowlist (tab Cấu hình) |
| Đăng nhập xong quay về trang trắng | Site URL / Redirect URLs sai (mục 1.3) |
| Đổi env trên Vercel không ăn | Biến `VITE_*` nhúng lúc build — phải **Redeploy** |
| Bot im lặng | Chưa bật MESSAGE CONTENT INTENT, sai `DISCORD_TOKEN`, hoặc kênh bị chặn trong `settings.json` |
| Bot báo lỗi Supabase | Sai/thiếu `SUPABASE_SERVICE_ROLE_KEY` |
| `@bot` không trả lời câu hỏi | Máy chưa cài/đăng nhập Claude CLI (`claude --version`) |
| Sync Notion lỗi mọi task | `NOTION_PROP_*` trỏ cột không tồn tại (hay gặp nhất: điền `NOTION_PROP_DESCRIPTION` mà DB không có cột) |
| Nút "Xuất Google Sheet" báo thiếu cấu hình | Chưa đặt `VITE_GOOGLE_CLIENT_ID`, hoặc domain chưa có trong Authorized JavaScript origins |
| Weekly report không ghi Sheet | Sheet chưa Share Editor cho email service account |
| Build mobile `invalid source release: 21` | Đang dùng JDK 17 — trỏ JDK 21 qua `~/.gradle/gradle.properties` |
