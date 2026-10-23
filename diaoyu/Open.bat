@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY (
  where py >nul 2>&1 && set "PY=py -3"
)
if not defined PY (
  echo 没找到 Python。
  echo 请先安装：https://www.python.org/downloads/
  echo 安装时务必勾选 Add python.exe to PATH，装完后重新打开这个窗口再双击 Open.bat。
  pause
  exit /b 1
)

echo 正在检查依赖…
%PY% -c "import customtkinter" >nul 2>&1
if errorlevel 1 (
  echo 第一次打开需要安装窗口库，大约几秒钟…
  %PY% -m pip install -r "%~dp0requirements.txt"
  if errorlevel 1 (
    echo.
    echo 自动安装失败。请在这个文件夹打开命令行，执行：
    echo %PY% -m pip install -r requirements.txt
    pause
    exit /b 1
  )
)

%PY% "%~dp0app.py"
if errorlevel 1 (
  echo.
  echo 窗口没有打开。把上面的红色报错截图发我。
  pause
)
