@echo off
cd /d "%~dp0"
if /i not "%~1"=="--run" (
  start "塔塔钓鱼安装依赖" cmd /k call "%~f0" --run
  exit /b 0
)

chcp 65001 >nul
title 塔塔钓鱼 - 安装依赖
echo ========================================
echo   安装依赖
echo ========================================
echo.

set "PYEXE="
set "PYARGS="
where python >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%I in ('where python') do (
    echo %%I | find /i "\WindowsApps\python.exe" >nul
    if errorlevel 1 (
      if not defined PYEXE set "PYEXE=%%I"
    )
  )
)
if not defined PYEXE (
  where py >nul 2>&1
  if not errorlevel 1 (
    set "PYEXE=py"
    set "PYARGS=-3"
  )
)
if not defined PYEXE where python >nul 2>&1 && set "PYEXE=python"

if not defined PYEXE (
  echo [错误] 没找到 Python。请安装并勾选 Add python.exe to PATH。
  pause
  exit /b 1
)

echo 使用：%PYEXE% %PYARGS%
if defined PYARGS (
  %PYEXE% %PYARGS% -m pip install -r "%~dp0requirements.txt"
) else (
  "%PYEXE%" -m pip install -r "%~dp0requirements.txt"
)
if errorlevel 1 (
  echo [错误] 安装失败。请检查网络后重试。
  pause
  exit /b 1
)
echo.
echo 安装完成。请关闭本窗口，再双击 Open.bat。
pause
exit /b 0
