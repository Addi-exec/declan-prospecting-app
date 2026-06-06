@echo off
title Declan Prospecting App - Setup (Windows)
cd /d "%~dp0"

echo ============================================================
echo   Declan Prospecting App - first-time setup (Windows)
echo ============================================================
echo This downloads Electron (~100MB). Please leave it running.
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed. Install the "LTS" version from https://nodejs.org
  echo then run this Setup again.
  echo.
  pause
  exit /b
)

rem Use a mirror for Electron's binary (bypasses blocked GitHub downloads)
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

echo Clearing any half-finished Electron download cache...
if exist "%LOCALAPPDATA%\electron\Cache" rmdir /s /q "%LOCALAPPDATA%\electron\Cache"
if exist "%LOCALAPPDATA%\Cache\electron" rmdir /s /q "%LOCALAPPDATA%\Cache\electron"
if exist node_modules rmdir /s /q node_modules

echo.
echo Installing (this is the slow part - downloading Electron)...
call npm install

if not exist "node_modules\electron\path.txt" (
  echo.
  echo Electron binary not found yet - forcing the download...
  call node node_modules\electron\install.js
)

rem Fallback: on some Node versions (notably v24) the auto-extract step finishes
rem without error but leaves the binary unpacked. If the zip is already in the
rem cache, extract it ourselves with PowerShell so setup still succeeds.
if not exist "node_modules\electron\path.txt" (
  echo.
  echo Finishing install directly from the downloaded cache...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $zip = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'electron\Cache') -Recurse -Filter 'electron-v*-win32-*.zip' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($zip) { $dist = Join-Path (Get-Location) 'node_modules\electron\dist'; if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }; New-Item -ItemType Directory -Force $dist | Out-Null; Expand-Archive -Path $zip.FullName -DestinationPath $dist -Force; Set-Content -NoNewline -Path (Join-Path (Get-Location) 'node_modules\electron\path.txt') -Value 'electron.exe'; Write-Host 'Done - extracted Electron from cache.' } else { Write-Host 'No cached Electron download was found to extract.' } } catch { Write-Host ('Direct extraction failed: ' + $_.Exception.Message) }"
)

if not exist "node_modules\electron\path.txt" (
  echo.
  echo ============================================================
  echo   Electron still did not download.
  echo ============================================================
  echo This is almost always one of these:
  echo   1) Antivirus / Windows Security blocking it.
  echo      Add this folder as an exclusion, or pause protection,
  echo      then run this Setup again:
  echo         %CD%
  echo   2) A network/firewall blocking downloads.
  echo      Try a different network (e.g. phone hotspot) and re-run.
  echo   3) Node v24 quirks - install the LTS version (v22) from
  echo      https://nodejs.org, then run this Setup again.
  echo.
  pause
  exit /b
)

echo.
echo ============================================================
echo   Setup complete! Starting the app...
echo ============================================================
call npm start
