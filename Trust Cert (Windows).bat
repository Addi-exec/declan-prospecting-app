@echo off
title Declan Prospecting App - Trust the signing certificate
cd /d "%~dp0"

echo ============================================================
echo   Trust the Declan Prospecting App signing certificate
echo ============================================================
echo.
echo This tells THIS Windows user account to trust the app's
echo self-signed certificate, so Windows stops warning that the
echo app is from an "unknown publisher".
echo.
echo You only need to do this once per Windows user account, and
echo only if the app still warns. Windows may pop up a security
echo box asking you to confirm - click YES.
echo.

if not exist "signing\declan-codesign.cer" (
  echo Could not find signing\declan-codesign.cer next to this file.
  echo Make sure this .bat is in the prospecting-app folder.
  echo.
  pause
  exit /b
)

echo Installing certificate into your Trusted Root + Trusted Publishers...
certutil -addstore -user -f Root "signing\declan-codesign.cer"
certutil -addstore -user -f TrustedPublisher "signing\declan-codesign.cer"

echo.
echo ============================================================
echo   Done. You can now run the installer without the
echo   "unknown publisher" warning on this account.
echo ============================================================
echo.
pause
