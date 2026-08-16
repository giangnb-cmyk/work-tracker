#!/usr/bin/env bash
# Liet ke file trong folder Google Drive -> nap DANH MUC (ten + link) vao kho RAG.
# Ban macOS/Linux cua sync-drive.bat. Vi du: ./sync-drive.sh --dry-run
# Yeu cau: Ollama chay (bge-m3), migration 0014, service account (GOOGLE_SHEETS_MCP.md).
cd "$(dirname "$0")" || exit 1
PY="$(command -v python3 || command -v python)"
echo "[$(date '+%F %T')] Bat dau nap danh muc Google Drive vao RAG ..."
"$PY" skills/drive_catalog.py "$@"
echo "[$(date '+%F %T')] Da xong (code $?)."
