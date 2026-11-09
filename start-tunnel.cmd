@echo off
rem Lumen tunnel: site at https://blago-ceo.github.io/lumen/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\tunnel.ps1"
pause
