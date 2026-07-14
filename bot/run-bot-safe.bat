@echo off
title Bot Work Tracker - CHE DO AN TOAN (khong bypass)
cd /d "%~dp0"

rem Tat bypass permission: Claude chi duoc chay dung task_ops.py / sprint_report.py,
rem va MOI NGUOI deu tag hoi duoc.
set BOT_BYPASS=0

:start
echo [%date% %time%] Dang khoi dong bot (che do an toan, khong bypass)...
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
