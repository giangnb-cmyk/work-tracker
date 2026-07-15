# Thư mục tài liệu cho RAG

Đây là **nguồn sự thật** cho kho tài liệu mà bot dùng để trả lời (RAG). Cách dùng:

1. **Bỏ file vào đây**: kéo thả PDF, Word (.docx), Excel (.xlsx), CSV, TXT, Markdown vào thư mục `docs/`
   (có thể để trong thư mục con tuỳ ý).
2. **Dán link vào `links.txt`**: mỗi dòng một URL (trang web, PDF online...). Dòng bắt đầu bằng `#` là ghi chú.
3. **Chạy đồng bộ**: nhấp đúp `bot\sync-rag.bat` (hoặc `python skills\sync_docs.py` trong thư mục `bot`).

Lệnh đồng bộ sẽ **làm cho RAG khớp đúng với thư mục này**:

- Nạp lại (re-embed) mọi file trong `docs/` và mọi link trong `links.txt`.
- **Xoá khỏi RAG** những nguồn bạn đã gỡ khỏi đây (mirror). Muốn giữ lại, chạy với `--no-prune`.

> `README.md` và `links.txt` trong thư mục gốc `docs/` **không** bị nạp làm tài liệu — chúng chỉ là file cấu hình.

## Yêu cầu

- Ollama đang chạy với `bge-m3` (embedding chạy local).
- Đã áp migration `supabase/migrations/0014_documents.sql` vào Supabase.
- Đã cài thư viện: `pip install -r bot/requirements.txt`.

## Vài lệnh hữu ích (chạy trong thư mục `bot`)

```bash
python skills\sync_docs.py                 # đồng bộ tài liệu chung
python skills\sync_docs.py --no-prune      # không xoá nguồn đã gỡ
python skills\sync_docs.py --project <id>  # đồng bộ cho 1 project cụ thể
python skills\doc_ingest.py list           # xem RAG đang có gì
```

PDF dạng scan (ảnh) cần OCR trước rồi mới nạp được (reader đọc chữ, không đọc ảnh).
