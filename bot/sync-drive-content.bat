@echo off
chcp 65001 >nul
title Sync Drive content - nap RUOT tai lieu Drive vao RAG
cd /d "%~dp0"

rem Tai va doc NOI DUNG THAT ben trong tai lieu Google Drive (Docs/Sheets/Slides/PDF/Word/
rem Excel) -> nap vao kho RAG. Khac sync-drive.bat: file do chi lap DANH MUC (ten + link,
rem de tra loi "file nam o dau"), file nay nap RUOT (de tra loi "trong file viet gi").
rem
rem BO QUA file khong dang doc ruot (mac dinh: thu muc csv_config + file localization) -
rem sua danh sach o settings.json > "rag_drive_skip". Muon nap tat ca: them --no-skip.
rem
rem NAP TANG DAN: chi file co sua tren Drive moi embedding lai. LAN DAU chay het ~2 gio
rem (embedding local ~3s/chunk); nhung lan sau chi vai giay. Cu de chay, dung tat giua chung.
rem
rem Yeu cau: Ollama chay (bge-m3), da ap migration 0014 + 0027, da pip install -r requirements.txt,
rem          va keys\service-account-gsheets.json (xem GOOGLE_SHEETS_MCP.md Buoc 1-2).
rem Them tham so neu can, vi du: sync-drive-content.bat --dry-run

echo [%date% %time%] Bat dau nap ruot tai lieu Google Drive vao RAG ...
python skills\drive_ingest.py %*

echo.
echo [%date% %time%] Da xong (code %errorlevel%).
pause
