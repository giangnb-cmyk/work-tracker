@echo off
title Bot Work Tracker - Claude CLI (BYPASS - chi owner)
cd /d "%~dp0"

rem Che do bypass: Claude tu chay tool khong hoi. Chi bat khi bypass_permissions=true
rem trong settings.json VA da dien allowed_user_ids (chi owner ra lenh duoc).
set BOT_BYPASS=1

:start
echo [%date% %time%] Dang khoi dong bot (BYPASS)...
python bot.py

if %errorlevel%==2 (
    echo.
    echo Bot da chay o cua so khac roi - khong mo them. Dong cua so nay la xong.
    pause
    exit /b
)

echo.
echo [%date% %time%] Bot da thoat (code %errorlevel%). Tu khoi dong lai sau 5 giay...
echo Nhan Ctrl+C de dung han.
timeout /t 5 /nobreak >nul
goto start
