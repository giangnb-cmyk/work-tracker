# Bot Work Tracker

Ứng dụng quản lý **sprint & task** cho team phần mềm, gồm 3 phần dùng chung một Firebase project:

| Phần | Công nghệ | Vai trò |
|------|-----------|---------|
| **`web/`** | React + Vite + TypeScript + Firebase | Web app: đăng nhập Google, bảng Kanban, giao task, thống kê sprint. Deploy Vercel. |
| **`web/api/`** | Vercel Serverless Functions | Cổng đồng bộ **Notion** (giữ token phía server). |
| **`bot/`** | Python `discord.py` + `firebase-admin` | Bot Discord: tạo/giao task, báo cáo sprint, nhắc nhở, hỏi đáp AI (Claude CLI). |

- Data model dùng chung: **[DATA_MODEL.md](DATA_MODEL.md)** (nguồn chân lý cho web + bot).
- Chuẩn code: **[CLAUDE.md](CLAUDE.md)** · Design system: **[design_system_guide.md](design_system_guide.md)**.
- Bảo mật Firestore: **[firestore.rules](firestore.rules)**.

```
bot-work-tracker/
├── web/          # React SPA + api/ (Vercel)
├── bot/          # Discord bot (self-hosted) — xem bot/README.md
├── firestore.rules / firestore.indexes.json / firebase.json
├── DATA_MODEL.md CLAUDE.md design_system_guide.md
```

---

## 1. Firebase (bắt buộc — cả web & bot dùng chung)

1. Tạo project tại <https://console.firebase.google.com>.
2. **Authentication** → Sign-in method → bật **Google**.
3. **Firestore Database** → Create database (production mode).
4. (Tuỳ chọn) **Storage** → bật nếu muốn **upload ảnh ref** đính kèm task. Không bật thì vẫn
   đính kèm được bằng cách dán link ảnh (Drive/Discord…).
5. Deploy security rules + indexes (cài Firebase CLI: `npm i -g firebase-tools`):
   ```bash
   firebase login
   firebase use --add        # chọn project vừa tạo
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
   (Bỏ `,storage` nếu chưa bật Storage.)
6. **Cấp quyền admin cho chính bạn**: đăng nhập web một lần (tạo doc `users/{uid}`), rồi vào
   Firestore Console sửa `role` của doc đó thành `admin` (hoặc chạy `python bot/set_admin.py <email>`).

---

## 2. Web app (`web/`)

```bash
cd web
npm install
cp .env.example .env.local     # điền VITE_FIREBASE_* (Console → Project Settings → Web app)
npm run dev                    # http://localhost:5173
```

Build production: `npm run build` → `web/dist/`.

### Deploy Vercel

1. Import repo GitHub vào Vercel.
2. **Root Directory = `web`** (quan trọng — vì app nằm trong thư mục con).
3. Framework preset: **Vite**. Build command `npm run build`, output `dist` (đã có `vercel.json`).
4. Thêm **Environment Variables**: tất cả `VITE_FIREBASE_*` (+ tuỳ chọn `VITE_ALLOWED_EMAIL_DOMAIN`),
   và các biến Notion ở mục 4 nếu dùng đồng bộ Notion.
5. Trong Supabase → Authentication → **URL Configuration**, đặt **Site URL** =
   `https://m-plan.easygoing.vn` và thêm `https://m-plan.easygoing.vn/**` vào **Redirect URLs**
   để Google sign-in quay lại đúng domain (app gửi `redirectTo = window.location.origin`,
   origin nào không nằm trong allowlist sẽ bị đá về Site URL).

### Phân quyền, allowlist đăng nhập & vai trò

- **Quyền (`role`)**: `admin` quản lý thành viên, sprint, allowlist và toàn bộ task (thêm/sửa/xoá);
  `member` chỉ đổi trạng thái task của mình. Admin đầu tiên: sửa `role` thành `admin` trong Console.
- **Ai được đăng nhập**: admin vào trang **Cấu hình** trên web để thêm **email** hoặc **domain**
  được phép. Khi danh sách còn trống → mọi tài khoản Google vào được (để admin đầu tiên khởi tạo);
  thêm ít nhất một domain để khoá lại. Người ngoài danh sách đăng nhập sẽ bị từ chối ngay.
- **Chuyên môn (`jobRole`)**: lần đầu đăng nhập, nhân viên chọn vai trò — Developer, 2D Artist,
  Game Designer, Sound Designer, UI Artist, Animator (không ảnh hưởng quyền).

### Thông báo Discord khi task hoàn thành

Khi một task chuyển sang **Done**, hệ thống báo vào Discord và **mention** người nhận + người tạo
(qua `discordId` khai trong trang Thành viên).
- **Từ web**: cần đặt env `DISCORD_WEBHOOK_URL` ở Vercel (Discord → Channel Settings → Integrations →
  Webhooks → New Webhook → Copy URL) + `FIREBASE_SERVICE_ACCOUNT` (để xác thực) — xem `web/.env.example`.
- **Từ bot**: bot tự post bằng token của nó vào kênh `task_done_channel_id` trong `bot/settings.json`.
- Chưa cấu hình thì bỏ qua êm, không lỗi.

---

## 3. Discord bot (`bot/`)

Bot chạy nền trên máy/VPS (không deploy Vercel). Xem hướng dẫn chi tiết tại **[bot/README.md](bot/README.md)**.
Tóm tắt: tạo Discord app + bot token (bật *Message Content Intent*), tải Firebase **service account key**
(Console → Project Settings → Service Accounts → Generate new private key) lưu vào `bot/serviceAccountKey.json`
(đã gitignore), `pip install -r requirements.txt`, cài Claude CLI, rồi `run-bot-safe.bat`.

Bot hiểu tiếng Việt tự nhiên khi được tag, ví dụ:
- `@bot tạo task "Fix màn login" cho @Nam sprint active, ưu tiên cao, hạn 2026-07-20`
- `@bot task của tôi còn những gì?` · `@bot đổi task abc123 sang done`
- `@bot báo cáo sprint` · hoặc hỏi tự do bất kỳ.

Nhắc nhở tự động (task quá hạn / standup) chạy qua Windows Task Scheduler với `run-reminder.bat` / `run-standup.bat`.

---

## 4. Đồng bộ Notion (tuỳ chọn)

Tạo task trên web/bot sẽ tự tạo page trên Notion; đổi trạng thái sẽ cập nhật lại Notion; task có link về Notion.
Logic Notion nằm ở **một cổng duy nhất**: `web/api/notion.ts` (Vercel Serverless Function) — token Notion
chỉ ở phía server, **không** lọt vào bundle trình duyệt.

**Chuẩn bị Notion:**
1. Tạo integration tại <https://www.notion.so/my-integrations> → lấy **Internal Integration Token**.
2. Tạo (hoặc chọn) một **database** Notion có các property: `Name` (title), `Status` (status/select),
   và tuỳ chọn `Assignee`, `Priority`, `Due`. Share database đó cho integration.
3. Lấy **Database ID** từ URL của database.

**Biến môi trường (đặt ở Vercel → Environment Variables):**

| Biến | Ý nghĩa |
|------|---------|
| `NOTION_TOKEN` | Internal Integration Token |
| `NOTION_DATABASE_ID` | ID database |
| `FIREBASE_SERVICE_ACCOUNT` | JSON service account (1 dòng) — để cổng xác thực Firebase ID token của web |
| `NOTION_SYNC_SECRET` | chuỗi bí mật tự đặt — bot dùng để gọi cổng |
| `NOTION_PROP_STATUS` / `NOTION_STATUS_TYPE` | tên & kiểu cột trạng thái (mặc định `Status` / `status`) |
| `NOTION_PROP_ASSIGNEE` / `NOTION_ASSIGNEE_TYPE` | cột người nhận (`Assignee` / `rich_text` hoặc `people`) |
| `NOTION_STATUS_MAP` | JSON map enum→tên Notion, mặc định `{"todo":"Todo","in_progress":"In progress","review":"Review","done":"Done"}` |

Chi tiết mapping xem phần "Notion sync" trong [DATA_MODEL.md](DATA_MODEL.md). Ở phía **bot**, đặt
`NOTION_GATEWAY_URL=https://m-plan.easygoing.vn/api/notion` và `NOTION_SYNC_SECRET` (trùng với Vercel).
Nếu chưa cấu hình Notion, mọi thứ vẫn chạy bình thường — chỉ là task không đồng bộ sang Notion.

---

## 5. CodeGraph (tuỳ chọn — cho dev)

Dự án được index bằng [CodeGraph](https://github.com/colbymchenry/codegraph) để tra cứu code nhanh.
Thư mục `.codegraph/` là index cục bộ (đã gitignore). Sau khi clone, dev chạy:

```bash
codegraph init      # index lần đầu
codegraph sync      # cập nhật sau khi sửa code
```

---

## Bảo mật

- **Không commit** `.env*`, `serviceAccountKey.json`, hay token Notion/Discord (đã có trong `.gitignore`).
- Config Firebase Web (`VITE_FIREBASE_*`) là **công khai theo thiết kế** — được bảo vệ bằng Auth + Firestore rules.
- Service account (bot & cổng Notion) **bỏ qua** security rules → kiểm tra quyền nằm trong code.
