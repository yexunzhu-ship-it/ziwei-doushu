@echo off
chcp 65001 >nul
title Ziwei Doushu - Local Dev Server
cd /d "%~dp0"

set PORT=3000

echo ================================================
echo   Ziwei Doushu (ziwei-doushu) local launcher
echo   Folder: %CD%
echo ================================================
echo.

rem --- Already running? Just open the browser. ---
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [i] Server is already running on port %PORT%.
  echo [i] Opening http://localhost:%PORT% ...
  start "" http://localhost:%PORT%
  timeout /t 2 >nul
  exit /b 0
)

if not exist "node_modules" (
  echo [!] Dependencies missing. Installing from npmmirror, please wait...
  call npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund
  if errorlevel 1 (
    echo [!] Install failed. Check your network and run again.
    pause
    exit /b 1
  )
)

echo [i] Starting server. It will open http://localhost:%PORT% in your browser.
echo [i] Keep this window open. Close it to stop the server.
echo.

start "" http://localhost:%PORT%
call npm run dev

echo.
echo [i] Server stopped.
pause
