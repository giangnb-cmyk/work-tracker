#!/usr/bin/env bash
# Nap RUOT tai lieu Google Drive (Docs/Sheets/Slides/PDF/Word/Excel) vao kho RAG.
# Ban macOS/Linux cua sync-drive-content.bat. Vi du: ./sync-drive-content.sh --dry-run
# NAP TANG DAN: lan dau ~2h (embedding local), nhung lan sau vai giay. Dung tat giua chung.
# Yeu cau: Ollama chay (bge-m3), migration 0014+0027, keys/service-account-gsheets.json.
cd "$(dirname "$0")" || exit 1
PY="$(command -v python3 || command -v python)"
echo "[$(date '+%F %T')] Bat dau nap ruot tai lieu Google Drive vao RAG ..."
"$PY" skills/drive_ingest.py "$@"
echo "[$(date '+%F %T')] Da xong (code $?)."
