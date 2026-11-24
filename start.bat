@echo off
REM Agent Hub - start. Opretter virtuelt Python-miljoe ved foerste koersel.
cd /d "%~dp0"
if exist ".venv\agenthub-ready" goto run

echo.
echo  Agent Hub - foerste opstart: installerer (tager 1-2 minutter)...
echo.
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv 2>nul || python -m venv .venv
)
if not exist ".venv\Scripts\python.exe" (
  echo FEJL: Python 3.10+ blev ikke fundet. Installer fra https://www.python.org/downloads/
  echo      Husk at saette flueben i "Add python.exe to PATH".
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo FEJL under installation af pakker.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m pip install -r requirements-window.txt
if errorlevel 1 echo Bemaerk: pywebview kunne ikke installeres - Agent Hub bruger Edge-vindue i stedet.
echo ok> ".venv\agenthub-ready"

:run
".venv\Scripts\python.exe" -m agenthub %*
if errorlevel 1 pause
