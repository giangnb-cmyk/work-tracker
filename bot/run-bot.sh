#!/usr/bin/env bash
# Bot Work Tracker — che do BYPASS (chi owner). Ban macOS/Linux cua run-bot.bat.
# Claude tu chay tool khong hoi. Chi bat khi bypass_permissions=true trong settings.json
# VA da dien allowed_user_ids (chi owner ra lenh duoc).
cd "$(dirname "$0")" || exit 1
export BOT_BYPASS=1

PY="$(command -v python3 || command -v python)"

while true; do
  echo "[$(date '+%F %T')] Dang khoi dong bot (BYPASS)..."
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
