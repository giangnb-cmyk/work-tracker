# Bot Work Tracker (Discord)

Discord bot quan ly sprint/task cho team dev. Tag bot -> bot goi **Claude CLI** ->
Claude tu quyet dinh chay skill Python (`task_ops.py`, `sprint_report.py`) doc/ghi
truc tiep len Firestore. Ngoai ra co `reminder.py` chay theo lich de nhac task tre han
va dang cau hoi standup.

## Cau truc

```
bot/
  bot.py                 # Bot chinh: tag -> Claude CLI -> skill
  firebase_client.py     # Khoi tao firebase-admin (Singleton), get_db()
  settings.json          # model, quyen, kenh nhac, mood...
  requirements.txt
  .env.example           # Mau bien moi truong (copy thanh .env)
  run-bot-safe.bat       # Chay che do an toan (khong bypass) - nen dung
  run-bot.bat            # Chay che do bypass (chi owner)
  run-reminder.bat       # Task Scheduler: nhac task tre han
  run-standup.bat        # Task Scheduler: cau hoi standup
  skills/
    constants.py         # Enum status/priority + chuan hoa tieng Viet
    task_repo.py         # Truy cap Firestore dung chung (Repository)
    task_ops.py          # create / update / list task (Claude chay)
    sprint_report.py     # Bao cao tien do sprint (Claude chay)
    reminder.py          # Nhac tre han + standup (scheduler chay, KHONG qua Claude)
    notion_gateway.py    # POST sang cong Notion cua web (dong bo task)
```

## Cai dat

### 1. Tao Discord app + bot token
1. Vao <https://discord.com/developers/applications> -> **New Application**.
2. Tab **Bot** -> **Reset Token** -> copy token (dan vao `.env`).
3. Tab **Bot** -> bat **MESSAGE CONTENT INTENT** (bat buoc, de bot doc noi dung tin nhan).
4. Tab **OAuth2 > URL Generator**: chon scope `bot`, quyen `Send Messages` +
   `Read Message History`, mo URL de moi bot vao server.

### 2. Firebase service-account key
1. Firebase Console -> **Project Settings** -> **Service Accounts**.
2. **Generate new private key** -> tai file JSON.
3. Luu thanh `bot/serviceAccountKey.json` (file nay da bi **gitignore**, khong commit).
   Hoac dat duong dan khac qua `GOOGLE_APPLICATION_CREDENTIALS` trong `.env`.

### 3. Bien moi truong
```bash
copy .env.example .env      # Windows
# Roi dien DISCORD_TOKEN va (neu can) GOOGLE_APPLICATION_CREDENTIALS
```

### 4. Cai thu vien + Claude CLI
```bash
pip install -r requirements.txt
```
Cai **Claude CLI** (bot goi lenh `claude`). Kiem tra: `claude --version`.

### 5. Cau hinh settings.json
- `model`: model Claude dung (mac dinh `claude-opus-4-8`).
- `reminder_channel_id`, `standup_channel_id`: ID kenh Discord cho lich nhac
  (chuot phai kenh -> Copy Channel ID, can bat Developer Mode).
- `bypass_permissions`: de `false` (an toan). Chi bat neu chay `run-bot.bat` va
  da dien `allowed_user_ids`.

### 6. Chay bot
```
run-bot-safe.bat     # nen dung: Claude chi duoc chay 2 skill task, ai cung hoi duoc
```
`run-bot.bat` la che do bypass (Claude chay tool khong hoi) - chi dung khi
`bypass_permissions=true` va da khoa `allowed_user_ids`.

## Lich tu dong (Windows Task Scheduler)

Tao 2 task trong Task Scheduler, action = **Start a program**, tro toi file .bat:

- **Nhac task tre han**: `bot\run-reminder.bat` - chay 1 lan/ngay (vi du 9h00 sang).
  Query task chua done co `dueDate` <= hom nay, gom theo nguoi, ping qua `discordId`.
- **Standup**: `bot\run-standup.bat` - chay 1 lan/ngay (vi du 9h30 T2-T6). Dang cau
  hoi standup vao `standup_channel_id`.

Test tay truoc khi len lich:
```
python skills\reminder.py --dry-run
python skills\reminder.py --standup --dry-run
```

### Thong bao "task hoan thanh"

Khi 1 task duoc chuyen sang `done` (va truoc do chua done), bot tu dang 1 tin nhan
tieng Viet vao kenh Discord, vi du:
`✅ Task đã hoàn thành: "Fix login" (sprint Sprint 12). <@assignee> làm tốt lắm! cc <@reporter>`
Chi ping nhung nguoi that su co `discordId` (thieu thi bo qua), va khong ping trung
neu reporter cung la assignee.

- Kenh: `task_done_channel_id` trong `settings.json`; neu de `0` thi dung
  `reminder_channel_id`.
- Best-effort: thieu token/kenh hoac gui loi chi ghi log, KHONG lam hong lenh update.
  task_ops in dong `Discord: đã báo hoàn thành` / `Discord: bỏ qua (chưa cấu hình kênh)`.

## Ban co the noi gi voi bot (tieng Viet)

Tag bot roi go tu nhien, vi du:

- **Tao task**: `@bot tao task "Fix login" giao cho Nam, uu tien gap, sprint dang chay, han 2026-07-20`
- **Giao task**: `@bot giao task 3f9a1b2c cho Lan`
- **Doi trang thai**: `@bot task 3f9a1b2c xong roi` / `@bot task 3f9a1b2c dang lam`
- **Xem task cua toi**: `@bot xem task cua toi` / `@bot task cua toi con lai gi`
- **Xem task theo sprint/nguoi**: `@bot liet ke task sprint dang chay` / `@bot task cua Nam`
- **Bao cao sprint**: `@bot bao cao sprint` / `@bot tien do sprint 12 the nao`
- **Hoi dap tu do**: `@bot sprint la gi` (bot van tra loi binh thuong)

Bot nhan cac tu tieng Viet cho trang thai (`can lam`/`dang lam`/`review`/`xong`) va
uu tien (`thap`/`binh thuong`/`cao`/`gap`).

## Dong bo Notion

Task duoc mirror sang Notion qua 1 cong (gateway) duy nhat cua web
(`web/api/notion.ts`, Vercel serverless). Token Notion nam o server, bot KHONG giu
token - bot chi xac thuc bang secret dung chung.

Dat 2 bien trong `.env` cho khop voi deployment web:
```
NOTION_GATEWAY_URL=https://m-plan.easygoing.vn/api/notion
NOTION_SYNC_SECRET=<secret>
```
- `NOTION_SYNC_SECRET` PHAI **trung** voi bien `NOTION_SYNC_SECRET` da dat tren
  Vercel cua web (bot gui qua header `x-sync-secret`).
- De TRONG 2 bien nay -> bot bo qua Notion, KHONG bao loi (task van tao/cap nhat
  binh thuong tren Firestore).

Luong hoat dong:
- **Tao task**: ghi Firestore truoc, roi goi gateway `create`; neu thanh cong, ghi
  nguoc `notionPageId`/`notionUrl` len task. Neu assignee co `notionUserId` thi
  gateway gan dung nguoi tren Notion.
- **Cap nhat task**: chi khi task da co `notionPageId` VA co doi
  status/assignee/priority/due -> goi gateway `update`.
- Loi sync (mang, gateway, chua cai `requests`) chi ghi log - **khong** lam hong
  lenh ghi Firestore. task_ops in dong `Notion: synced (<url>)` / `Notion: skipped
  (...)` de bot thuat lai.

## Ghi chu ky thuat

- Skill chay standalone: `python skills/task_ops.py --help`, `python skills/sprint_report.py --help`.
  Cac skill tu them `bot/` vao `sys.path` de import `firebase_client`.
- Admin SDK **bo qua** Firestore security rules -> moi kiem tra quyen o trong code.
- Task tao qua bot co `source="discord"`; `reporterId` map tu `BOT_SENDER_ID` (Discord
  id nguoi gui, do bot truyen qua env chu khong lay tu noi dung tin nhan).
- KHONG commit `.env` va `serviceAccountKey.json` (da gitignore).
