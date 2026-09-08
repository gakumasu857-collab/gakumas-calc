@echo off
rem ============================================================
rem  hopemas release (code only): build -> deploy to Cloudflare Workers
rem  Same as "npm run release". Double-click to run.
rem  If you also changed the spreadsheet or images, use update-all.cmd.
rem  (ASCII only: cmd.exe mis-parses non-ASCII batch lines under UTF-8)
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo [1/1] npm run release  (build + wrangler deploy)
echo.
call npm run release
if errorlevel 1 (
  echo.
  echo *** FAILED. See the errors above. ***
) else (
  echo.
  echo *** DONE: https://gkapps.hoppepan.com ***
)
echo.
pause
