@echo off
REM Double-click entry. Always keep a visible console so failures are never silent.
cd /d "%~dp0"
if /i not "%~1"=="--run" (
  start "塔塔钓鱼" cmd /k call "%~f0" --run
  exit /b 0
)

chcp 65001 >nul
title 塔塔钓鱼
echo ========================================
echo   塔塔钓鱼
echo ========================================
echo 如果窗口没出来，请把本黑窗口全部文字截图发我。
echo.

set "PYEXE="
set "PYARGS="

REM Prefer a real python.exe, not the Microsoft Store stub.
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

if not defined PYEXE (
  where python >nul 2>&1
  if not errorlevel 1 set "PYEXE=python"
)

if not defined PYEXE (
  echo [错误] 没找到 Python。
  echo.
  echo 请先安装：https://www.python.org/downloads/
  echo 安装时务必勾选 Add python.exe to PATH。
  echo 装完后关掉本窗口，再双击 Open.bat。
  echo.
  goto :END_FAIL
)

echo 使用：%PYEXE% %PYARGS%
echo.

if defined PYARGS goto :RUN_PY_LAUNCHER
goto :RUN_PY_EXE

:RUN_PY_LAUNCHER
%PYEXE% %PYARGS% -c "import sys; print(sys.version)"
if errorlevel 1 (
  echo [错误] Python 无法运行。请重装 Python 并勾选 Add to PATH。
  goto :END_FAIL
)
echo 正在检查并安装依赖（第一次可能要等几秒）…
%PYEXE% %PYARGS% -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
  echo [错误] pip 安装失败。请检查网络后重试，或双击「一键安装依赖.bat」。
  goto :END_FAIL
)
echo.
echo 正在打开窗口…
%PYEXE% %PYARGS% "%~dp0launch.py"
if errorlevel 1 (
  echo.
  echo [错误] 窗口没有正常打开。
  echo 请把本黑窗口全部文字截图发我。
  goto :END_FAIL
)
goto :END_OK

:RUN_PY_EXE
"%PYEXE%" -c "import sys; print(sys.version)"
if errorlevel 1 (
  echo [错误] Python 无法运行。请重装 Python 并勾选 Add to PATH。
  goto :END_FAIL
)
echo 正在检查并安装依赖（第一次可能要等几秒）…
"%PYEXE%" -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
  echo [错误] pip 安装失败。请检查网络后重试，或双击「一键安装依赖.bat」。
  goto :END_FAIL
)
echo.
echo 正在打开窗口…
"%PYEXE%" "%~dp0launch.py"
if errorlevel 1 (
  echo.
  echo [错误] 窗口没有正常打开。
  echo 请把本黑窗口全部文字截图发我。
  goto :END_FAIL
)
goto :END_OK

:END_FAIL
echo.
pause
exit /b 1

:END_OK
echo.
echo 已结束。可直接关闭本窗口。
pause
exit /b 0
