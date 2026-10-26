@echo off
cd /d "%~dp0.."
node bridge\setup.mjs
if errorlevel 1 goto done
node bridge\server.mjs
:done
pause
