@echo off
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
  echo Python not found. Install Python 3.11+ and check Add to PATH.
  pause
  exit /b 1
)
python app.py
if errorlevel 1 (
  echo.
  echo Failed to open. Try: pip install -r requirements.txt
  pause
)
