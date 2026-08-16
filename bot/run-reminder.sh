#!/usr/bin/env bash
# Nhac task tre han + den han hom nay vao kenh Discord. Ban macOS/Linux cua run-reminder.bat.
# cron goi 1 lan/ngay (vi du 9h00 sang) — xem HUONG-DAN-SETUP.md muc 4.4. Ghi log ra workspace/.
cd "$(dirname "$0")" || exit 1
mkdir -p workspace
PY="$(command -v python3 || command -v python)"
"$PY" skills/reminder.py >> workspace/reminder.log 2>&1
