@echo off
REM Installerer Agent Hub hooks i Claude Code (%USERPROFILE%\.claude\settings.json)
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" ( echo Koer start.bat foerst, saa det virtuelle miljoe oprettes. & pause & exit /b 1 )
".venv\Scripts\python.exe" -m agenthub.install %*
pause
