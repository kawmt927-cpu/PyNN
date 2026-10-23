@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist D:\ (
  echo 这台电脑上没有 D 盘，没法安装到 D:\塔塔钓鱼。
  echo 你可以改把整个文件夹拷到任意盘，再双击 Open.bat。
  pause
  exit /b 1
)

set "DEST=D:\塔塔钓鱼"
echo 正在安装到 %DEST% ...
if not exist "%DEST%" mkdir "%DEST%"

robocopy "%CD%" "%DEST%" /E /XD __pycache__ .venv tests\__pycache__ /XF calibration.json /NFL /NDL /NJH /NJS /nc /ns /np
if errorlevel 8 (
  echo 复制失败。
  pause
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo.
  echo 还没装 Python。请先安装 Python 3.11 或更新版本，并勾选 Add python.exe to PATH。
  echo 装好后双击：%DEST%\Open.bat
  explorer "%DEST%"
  pause
  exit /b 1
)

echo.
echo 已放到 %DEST%
echo 正在打开窗口...
start "" /D "%DEST%" python "%DEST%\app.py"
explorer "%DEST%"
endlocal
