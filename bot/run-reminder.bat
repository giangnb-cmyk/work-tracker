@echo off
rem Nhac task tre han + den han hom nay vao kenh Discord.
rem Task Scheduler goi 1 lan/ngay (vi du 9h00 sang). Ghi log ra workspace\.
cd /d "%~dp0"
if not exist workspace mkdir workspace
python skills\reminder.py >> workspace\reminder.log 2>&1
