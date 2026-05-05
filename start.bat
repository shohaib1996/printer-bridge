@echo off
:: Better Edibles PPS Print Bridge — Auto-start script
:: Place this file in C:\print-bridge\ and run once to register auto-start

SET BRIDGE_DIR=%~dp0
SET NODE_SCRIPT=%BRIDGE_DIR%dist\index.js

:: Install dependencies if node_modules missing
IF NOT EXIST "%BRIDGE_DIR%node_modules" (
  echo Installing dependencies...
  cd /d "%BRIDGE_DIR%"
  call npm install
  call npm run build
)

:: Register in Task Scheduler to run at logon (run this script as Administrator once)
SCHTASKS /CREATE /F /TN "PPS Print Bridge" /TR "node \"%NODE_SCRIPT%\"" /SC ONLOGON /RL HIGHEST /RU "%USERNAME%"

echo.
echo [PPS Print Bridge] Auto-start registered in Task Scheduler.
echo [PPS Print Bridge] Starting now...
echo.

:: Start immediately
node "%NODE_SCRIPT%"
