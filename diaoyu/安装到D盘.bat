@echo off
cd /d "%~dp0"
if /i not "%~1"=="--run" (
  start "塔塔钓鱼安装" cmd /k call "%~f0" --run
  exit /b 0
)

chcp 65001 >nul
title 塔塔钓鱼 - 安装到 D 盘
echo ========================================
echo   安装到 D:\塔塔钓鱼
echo ========================================
echo.

if not exist D:\ (
  echo [错误] 这台电脑没有 D 盘。
  echo 请直接双击本文件夹里的 Open.bat，不必装到 D 盘。
  echo.
  pause
  exit /b 1
)

set "DEST=D:\塔塔钓鱼"
echo 正在复制到 %DEST% ...
if not exist "%DEST%" mkdir "%DEST%"

robocopy "%CD%" "%DEST%" /E /XD __pycache__ .venv tests\__pycache__ /XF calibration.json /NFL /NDL /NJH /NJS /nc /ns /np
if errorlevel 8 (
  echo [错误] 复制失败。
  pause
  exit /b 1
)

echo 复制完成。正在打开…
echo.
call "%DEST%\Open.bat" --run
exit /b %ERRORLEVEL%
