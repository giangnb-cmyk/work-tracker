@echo off
chcp 65001 >nul
title Sync RAG - nap tai lieu tu docs/ (bge-m3 + Supabase)
cd /d "%~dp0"

rem Dong bo kho RAG theo thu muc ..\docs (file + links.txt).
rem Yeu cau: Ollama dang chay (bge-m3), da ap migration 0014, da pip install -r requirements.txt.
rem Truyen them tham so neu can, vi du: sync-rag.bat --no-prune

echo [%date% %time%] Bat dau dong bo RAG tu thu muc docs/ ...
python skills\sync_docs.py %*

echo.
echo [%date% %time%] Da xong (code %errorlevel%).
pause
