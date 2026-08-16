#!/usr/bin/env bash
# Dang cau hoi standup hang ngay vao kenh Discord. Ban macOS/Linux cua run-standup.bat.
# cron goi 1 lan/ngay (vi du 9h30 sang T2-T6). Ghi log ra workspace/.
cd "$(dirname "$0")" || exit 1
mkdir -p workspace
PY="$(command -v python3 || command -v python)"
"$PY" skills/reminder.py --standup >> workspace/reminder.log 2>&1
