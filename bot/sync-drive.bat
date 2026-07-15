@echo off
chcp 65001 >nul
title Sync Drive catalog - liet ke file Drive vao RAG (danh muc)
cd /d "%~dp0"

rem Liet ke moi file trong folder Google Drive -> nap 'danh muc' (ten + link) vao kho RAG.
rem De hoi "tai lieu A nam o dau tren Drive" -> bot tra link mo file.
rem Yeu cau: Ollama chay (bge-m3), da ap migration 0014, da pip install -r requirements.txt,
rem          va service account + DRIVE_FOLDER_ID trong .env (xem GOOGLE_SHEETS_MCP.md Buoc 1-2).
rem Them tham so neu can, vi du: sync-drive.bat --dry-run

echo [%date% %time%] Bat dau nap danh muc Google Drive vao RAG ...
python skills\drive_catalog.py %*

echo.
echo [%date% %time%] Da xong (code %errorlevel%).
pause
