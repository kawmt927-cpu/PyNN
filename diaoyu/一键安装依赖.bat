@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY where py >nul 2>&1 && set "PY=py -3"
if not defined PY (
  echo 没找到 Python。请先安装并勾选 Add python.exe to PATH。
  pause
  exit /b 1
)
echo 正在安装依赖…
%PY% -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
  echo 安装失败。
  pause
  exit /b 1
)
echo 安装完成。现在双击 Open.bat 打开窗口。
pause
