# RAG tài liệu (bge-m3 + Supabase pgvector)

Cho phép bot trả lời câu hỏi về **nội dung tài liệu** (spec, quy trình, tài liệu họp, PDF…),
bên cạnh việc quản lý task/sprint. Embedding chạy **local bằng bge-m3 qua Ollama**; vector lưu
ngay trong **Supabase Postgres (pgvector)** — không cần database riêng.

## Thành phần đã thêm

| File | Vai trò |
|------|---------|
| `supabase/migrations/0014_documents.sql` | Bảng `documents` (vector 1024), index HNSW, RLS, hàm `match_documents` |
| `bot/skills/embeddings.py` | Gọi bge-m3 qua Ollama HTTP → vector (dùng `requests`) |
| `bot/skills/doc_reader.py` | Đọc PDF/Word/Excel/CSV/txt/md → cắt chunk (logic thuần) |
| `bot/skills/doc_repo.py` | Truy cập bảng `documents` (chèn/xoá/tìm) |
| `bot/skills/doc_ingest.py` | **CLI nạp tài liệu** (chạy tay — thao tác quản trị) |
| `bot/skills/doc_search.py` | **CLI tìm kiếm** — Claude gọi khi người dùng hỏi về tài liệu |
| `bot/skills/web_reader.py` | Tải nội dung từ URL (HTML/PDF) cho link |
| `bot/skills/sync_docs.py` | **CLI đồng bộ** — mirror thư mục `docs/` vào RAG |
| `bot/skills/drive_gateway.py` | Cổng gọi Google Drive API (chỉ đọc) — dùng chung cho 2 skill Drive |
| `bot/skills/drive_catalog.py` | **CLI danh mục Drive** — tên + link ("file nằm ở đâu") |
| `bot/skills/drive_ingest.py` | **CLI ruột Drive** — nội dung thật bên trong file ("trong file viết gì") |
| `bot/skills/sheets_reader.py` | Đọc Google Sheet >10MB qua Sheets API (Drive từ chối export) |
| `bot/sync-rag.bat` | Nhấp đúp để chạy đồng bộ |
| `bot/sync-drive.bat` / `bot/sync-drive-content.bat` | Nhấp đúp: nạp danh mục / nạp ruột Drive |
| `docs/` | Thư mục nguồn: bỏ file vào + dán link vào `links.txt` |

`bot.py` đã được nối: thêm `DOC_HINT` vào system prompt và cho phép Claude chạy
`doc_search.py` ở **chế độ an toàn**. `doc_ingest.py` **không** nằm trong danh sách an toàn
(nạp/xoá tài liệu là việc quản trị, chạy tay).

## Cài đặt (làm 1 lần)

1. **Ollama + bge-m3** đang chạy trên máy bot:
   ```bash
   ollama pull bge-m3
   ollama serve      # hoặc mở app Ollama
   ```

2. **Áp migration** vào Supabase — qua Supabase MCP (`execute_sql` với nội dung
   `0014_documents.sql`) hoặc dán vào SQL Editor trên Dashboard. Sau đó chạy `get_advisors`
   (security/perf) như các stage trước để chắc không có cảnh báo.

3. **Cài thư viện nạp tài liệu** (chỉ cần cho `doc_ingest.py`):
   ```bash
   pip install -r bot/requirements.txt
   ```

4. **Biến môi trường** (đã có trong `.env.example`): `OLLAMA_HOST`, `RAG_EMBED_MODEL` — để trống
   là dùng mặc định `http://localhost:11434` + `bge-m3`.

## Cách khuyên dùng: thư mục `docs/` + một lệnh đồng bộ

Coi thư mục `docs/` (ở gốc repo) là **nguồn sự thật**:

1. Bỏ file (PDF/Word/Excel/CSV/txt/md) vào `docs/`.
2. Dán link vào `docs/links.txt` (mỗi dòng 1 URL; dòng `#` là ghi chú).
3. Nhấp đúp `bot\sync-rag.bat` (hoặc `python skills\sync_docs.py`).

Lệnh đồng bộ sẽ nạp/embed lại mọi file + link, và **xoá khỏi RAG** những nguồn bạn đã gỡ
khỏi `docs/` (mirror). Thêm `--no-prune` nếu không muốn xoá. Xem `docs/README.md`.

## Tài liệu trên Google Drive: **danh mục** và **ruột**

Hai skill bổ sung nhau, lịch daily chạy **cả hai**:

| Skill | Nạp gì | Trả lời được câu hỏi |
|-------|--------|----------------------|
| `drive_catalog.py` | Danh mục: tên, loại, thư mục, link (1 chunk/file) | "Tài liệu M1_Balance nằm ở đâu?" → trả link |
| `drive_ingest.py` | **Ruột**: nội dung thật trong Docs/Sheets/Slides/PDF/Word/Excel | "Trong M1_Balance quy định gì?" → trả lời + trích nguồn |

```bash
python skills\drive_catalog.py                  # danh mục (nhanh, ~1 phút)
python skills\drive_ingest.py                   # ruột (xem lưu ý bên dưới)
python skills\drive_ingest.py --dry-run         # chỉ đếm chunk, không nạp
python skills\drive_ingest.py --no-skip         # nạp tất cả, bỏ mọi bộ lọc
python skills\drive_ingest.py --force           # nạp lại cả file không đổi
```

### Bỏ qua file không đáng đọc ruột — `settings.json` > `rag_drive_skip`

Dự án nào cũng có loại file **chỉ toàn bảng số / cặp chuỗi** — nạp ruột vào chỉ làm nhiễu
kho mà không trả lời được câu hỏi nào, lại tốn hàng giờ embedding. Quy tắc để ở
`settings.json`, **không hardcode** → dự án sau chỉ sửa config, không phải sửa code:

```json
"rag_drive_skip": {
  "folders": ["csv_config"],
  "name_contains": ["localization", "localize"]
}
```

- `folders` — khớp **chính xác** tên thư mục Drive (không phân biệt hoa thường).
- `name_contains` — khớp **một phần** tên file (`localization` bắt `M1 - Localization.csv`).
- Thêm tạm cho 1 lần chạy: `--skip-folder <tên>` / `--skip-name <chuỗi>`; nạp hết: `--no-skip`.

Skill in rõ **từng file bị bỏ và lý do** ở đầu mỗi lần chạy — không lọc âm thầm.

> Các file này **vẫn nằm trong danh mục** (`drive_catalog.py`), nên bot vẫn chỉ được "file
> nằm ở đâu" + link, chỉ là không đọc ruột chúng.

**Nạp tăng dần** — embedding bge-m3 chạy local ~**3s/chunk**, nạp toàn bộ ruột Drive
(~2.4k chunk) mất **~2 giờ**. Nên mỗi nguồn lưu `documents.source_version` = `modifiedTime`
của Drive (migration `0027`); lần sau **chỉ file có sửa mới embedding lại** → ngày thường
chạy vài giây. Lần đầu cứ để chạy hết, đừng tắt giữa chừng.

**Nguồn trong kho** đặt tên `Drive: <tên file>` — nhờ tiền tố này `sync_docs.py` biết
không prune nhầm (xoá nhầm thì nạp lại mất 2 tiếng).

**Sheet > 10MB**: Drive từ chối export `.xlsx` (`exportSizeLimitExceeded`) — 10/40 file
của kho hiện tại rơi vào đây. `sheets_reader.py` đọc thẳng qua Sheets API (đọc theo vùng,
không dính giới hạn đó) nên vẫn nạp được.

**File quá dài**: trần **300 chunk/file** cho file lọt qua bộ lọc. Skill in rõ đã cắt bao
nhiêu, không cắt âm thầm.

## Cách thủ công (nạp lẻ từng file)

**Nạp tài liệu** (chạy tay trong thư mục `bot/skills/`):

```bash
python doc_ingest.py add ./tai_lieu                       # nạp cả thư mục (tài liệu chung)
python doc_ingest.py add spec.pdf --project <project_id>  # gắn vào 1 project
python doc_ingest.py add spec.pdf --replace               # nạp lại, xoá bản cũ cùng tên trước
python doc_ingest.py list                                 # xem đã nạp gì
python doc_ingest.py remove --source spec.pdf             # xoá 1 nguồn
```

**Hỏi qua Discord** — chỉ cần tag bot hỏi bình thường, Claude tự quyết định gọi `doc_search.py`:

> @bot quy trình release gồm những bước nào?
> @bot chính sách nghỉ phép ra sao?

Bot sẽ tìm các đoạn liên quan, trả lời **chỉ dựa trên tài liệu** và trích nguồn `[1] tên_file`.
Nếu không có tài liệu khớp, bot nói rõ là kho chưa có thông tin (không bịa).

## Ghi chú kỹ thuật

- **Số chiều 1024** khớp bge-m3 dense. Nếu đổi sang model embedding khác, sửa `vector(1024)`
  trong migration và `EMBED_DIM` trong `embeddings.py` cho khớp.
- **PDF scan (ảnh)**: cần OCR trước (ví dụ `ocrmypdf`) rồi mới nạp — `doc_reader` đọc chữ, không đọc ảnh.
- **Bảo mật**: `doc_search.py` chỉ đọc (không ghi DB); `doc_ingest.py` không nằm trong allowedTools
  an toàn nên người dùng Discord không thể khiến bot nạp/xoá tài liệu.
- **Chi phí**: embedding chạy local (miễn phí, không gọi API ngoài). Chỉ tốn dung lượng Postgres
  cho cột `embedding`.
