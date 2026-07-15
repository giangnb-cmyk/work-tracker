# Google Sheets qua MCP (service account) — cho bot & phiên Claude Code

Cho phép hỏi nội dung **Google Sheet trong folder Drive** đã chia sẻ. Dùng MCP
`xing5/mcp-google-sheets` với **service account** (không cần đăng nhập từng người).
Đã cấu hình **chỉ đọc** cho bot (không cho tạo/sửa/xoá sheet).

## Bước 1 — Tạo service account (Google Cloud)

1. Vào <https://console.cloud.google.com> → tạo (hoặc chọn) một Project.
2. **APIs & Services → Enable APIs** → bật cả hai: **Google Sheets API** và **Google Drive API**.
3. **IAM & Admin → Service Accounts → Create service account** (đặt tên tuỳ ý, ví dụ `bot-sheets-reader`).
4. Mở service account vừa tạo → tab **Keys → Add key → Create new key → JSON** → tải file JSON về.
5. Đổi tên file thành `service-account-gsheets.json` và đặt vào thư mục **`keys/`** ở gốc repo:
   `D:\Project\bot-work-tracker\keys\service-account-gsheets.json`
   (Thư mục `keys/` và tên `service-account*.json` đã được `.gitignore` — an toàn, không bị commit.)

## Bước 2 — Chia sẻ folder Drive cho service account

1. Mở service account → copy **email** của nó (dạng `...@...iam.gserviceaccount.com`).
2. Vào folder Drive chứa các sheet → **Share** → dán email đó → quyền **Viewer** (chỉ đọc là đủ).
3. Lấy **Folder ID** từ URL: `https://drive.google.com/drive/folders/<ĐÂY_LÀ_FOLDER_ID>`.

## Bước 3 — Cài `uv` (để chạy `uvx`)

MCP chạy bằng `uvx` (thuộc `uv`). Trên Windows, mở PowerShell:

```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

(hoặc `pip install uv`). Mở lại terminal và kiểm tra: `uvx --version`.

## Bước 4a — Dùng trong phiên Claude Code của bạn

`.mcp.json` (gốc repo) đã được thêm server `google-sheets`. Chỉ cần:

- Sửa `DRIVE_FOLDER_ID` = folder id ở Bước 2 (và chỉnh lại đường dẫn key nếu để chỗ khác).
- Chạy `claude` trong thư mục repo → các tool `mcp__google-sheets__*` sẵn sàng. Thử: *"liệt kê các spreadsheet trong folder"*.

## Bước 4b — Bật cho bot Discord

1. Sửa **`bot/mcp-bot.json`**: điền `DRIVE_FOLDER_ID` và (nếu cần) đường dẫn key.
2. Trong **`bot/settings.json`** đặt `"sheets_mcp_enabled": true`.
3. Khởi động lại bot (`run-bot-safe.bat`).

Khi bật, bot nạp **riêng** file `mcp-bot.json` (dùng `--strict-mcp-config` nên KHÔNG kéo theo
Supabase MCP trong `.mcp.json`), và ở chế độ an toàn chỉ mở đúng **9 tool đọc**
(`list_spreadsheets`, `list_sheets`, `get_sheet_data`, `search_spreadsheets`,
`find_in_spreadsheet`, …). Các tool ghi (`update_cells`, `add_rows`, `create_spreadsheet`…)
**không** nằm trong allowlist nên bot không thể sửa sheet, dù server có hỗ trợ.

Thử trên Discord: `@bot trong file "Kế hoạch Q3" cột doanh thu tổng bao nhiêu?`

## Bảo mật

- Service account chỉ **Viewer** trên đúng folder đó → không đụng dữ liệu khác.
- Bot chỉ được cấp **tool đọc**; giữ `bypass_permissions=false`. Nếu bật bypass, mọi tool
  (kể cả ghi) sẽ mở — chỉ bật khi đã điền `allowed_user_ids`.
- File key JSON là **bí mật**, đã được gitignore. Không commit, không đưa lên web.
- Nếu bạn tự đặt `safe_allowed_tools` trong settings.json thì nhớ thêm 9 tool sheet vào đó
  (danh sách trong `bot.py` → `SHEET_READ_TOOLS`), vì cấu hình tay sẽ ghi đè mặc định.

## Trục trặc thường gặp

- **`uvx` not found**: cài `uv` (Bước 3), mở lại terminal, chắc chắn `uvx` trong PATH.
- **Lần gọi đầu chậm**: `uvx` tải package lần đầu rồi cache; các lần sau nhanh.
- **403 / permission denied**: chưa share folder cho email service account, hoặc chưa bật
  Sheets/Drive API.
- **Không thấy sheet nào**: sai `DRIVE_FOLDER_ID`, hoặc sheet nằm ngoài folder đã chia sẻ.
- **Bot treo khi bật MCP**: kiểm tra `mcp-bot.json` đúng JSON và `uvx` chạy được; xem log bot.
