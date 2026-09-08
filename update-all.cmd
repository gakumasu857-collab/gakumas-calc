@echo off
rem ============================================================
rem  hopemas full update: images -> spreadsheet -> build -> deploy
rem    1. Google Drive images -> R2      : npm run sync:images  (skipped if not configured)
rem    2. Spreadsheet -> R2 + regenerate  : npm run gen:all
rem    3. build -> deploy                 : npm run release
rem  Takes about 2-3 minutes. Double-click to run.
rem  Notes for editing: ASCII only (cmd.exe mis-parses non-ASCII lines under UTF-8),
rem  and never put parentheses inside an if-block (cmd treats them as block delimiters).
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo [1/3] Drive images to R2 : npm run sync:images
echo.
call npm run sync:images
if errorlevel 1 (
  echo.
  echo *** image sync failed or not configured - continuing. Release works without images. ***
)
echo.
echo [2/3] Spreadsheet to R2 + regenerate data : npm run gen:all
echo.
call npm run gen:all
if errorlevel 1 (
  echo.
  echo *** FAILED at data generation. See the errors above. ***
  echo.
  pause
  exit /b 1
)
echo.
echo [3/3] build and deploy : npm run release
echo.
call npm run release
if errorlevel 1 (
  echo.
  echo *** FAILED at deploy. See the errors above. ***
) else (
  echo.
  echo *** DONE: https://gkapps.hoppepan.com ***
)
echo.
pause
