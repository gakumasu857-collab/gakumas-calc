@echo off
rem ============================================================
rem  hopemas local preview: start the dev server and open the browser.
rem  Use this to check changes BEFORE releasing (nothing is deployed).
rem  Close this window (or press Ctrl+C) to stop the server.
rem  Notes for editing: ASCII only, no parentheses inside if-blocks.
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo [dev] starting local server at http://localhost:5173
echo       the browser opens in a few seconds. Close this window to stop.
echo.
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:5173"
call npm run dev
pause
