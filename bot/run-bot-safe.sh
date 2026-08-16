#!/usr/bin/env bash
# Bot Work Tracker — CHE DO AN TOAN (khong bypass). Ban macOS/Linux cua run-bot-safe.bat.
# Tat bypass permission: Claude chi duoc chay dung task_ops.py / sprint_report.py,
# va MOI NGUOI deu tag hoi duoc.
cd "$(dirname "$0")" || exit 1
export BOT_BYPASS=0

PY="$(command -v python3 || command -v python)"

while true; do
  echo "[$(date '+%F %T')] Dang khoi dong bot (che do an toan, khong bypass)..."
  "$PY" bot.py
  code=$?
  if [ "$code" -eq 2 ]; then
    echo
    echo "Bot da chay o cua so khac roi - khong mo them. Dong cua so nay la xong."
    exit 0
  fi
  echo
  echo "[$(date '+%F %T')] Bot da thoat (code $code). Tu khoi dong lai sau 5 giay... (Ctrl+C de dung han)"
  sleep 5
done
