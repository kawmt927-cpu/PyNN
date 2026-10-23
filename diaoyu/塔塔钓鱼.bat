@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
  echo 没找到 Python。请先安装 Python 3.11 或更新版本，并勾选 Add python.exe to PATH。
  pause
  exit /b 1
)
python app.py
if errorlevel 1 (
  echo.
  echo 窗口没有打开。如果提示缺少模块，请在这个文件夹执行：
  echo pip install -r requirements.txt
  pause
)
