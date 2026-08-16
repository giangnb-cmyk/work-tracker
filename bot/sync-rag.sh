#!/usr/bin/env bash
# Dong bo kho RAG theo thu muc ../docs (file + links.txt). Ban macOS/Linux cua sync-rag.bat.
# Yeu cau: Ollama dang chay (bge-m3), da ap migration 0014, da pip install -r requirements.txt.
# Truyen them tham so neu can, vi du: ./sync-rag.sh --no-prune
cd "$(dirname "$0")" || exit 1
PY="$(command -v python3 || command -v python)"
echo "[$(date '+%F %T')] Bat dau dong bo RAG tu thu muc docs/ ..."
"$PY" skills/sync_docs.py "$@"
echo "[$(date '+%F %T')] Da xong (code $?)."
