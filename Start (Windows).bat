@echo off
title Declan Prospecting App
cd /d "%~dp0"

echo ----------------------------------------
echo   Declan Prospecting App
echo ----------------------------------------

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js isn't installed yet.
  echo Please install the "LTS" version from https://nodejs.org
  echo then double-click this file again.
  echo.
  pause
  exit /b
)

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

if not exist "node_modules\electron\path.txt" (
  echo.
  echo App isn't fully installed yet. Please run "Setup ^(Windows^).bat" first.
  echo.
  pause
  exit /b
)

echo.
echo Opening the app...
call npm start
