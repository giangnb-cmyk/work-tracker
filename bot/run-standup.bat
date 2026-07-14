@echo off
rem Dang cau hoi standup hang ngay vao kenh Discord.
rem Task Scheduler goi 1 lan/ngay (vi du 9h30 sang T2-T6). Ghi log ra workspace\.
cd /d "%~dp0"
if not exist workspace mkdir workspace
python skills\reminder.py --standup >> workspace\reminder.log 2>&1
