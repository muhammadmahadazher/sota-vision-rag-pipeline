@echo off
setlocal

cd /d "%~dp0"
set "PROFILE=requirements.txt"
if /i "%~1"=="advanced" set "PROFILE=requirements-advanced.txt"

where node >nul 2>&1 || (
  echo Node.js 20+ is required.
  exit /b 1
)
where python >nul 2>&1 || (
  echo Python 3.12+ is required.
  exit /b 1
)
python -c "import sys; raise SystemExit(sys.version_info < (3, 12))" || exit /b 1

if not exist ".venv\Scripts\python.exe" python -m venv .venv
".venv\Scripts\python.exe" -m pip install --upgrade pip || exit /b 1
".venv\Scripts\python.exe" -m pip install -r "backend\%PROFILE%" || exit /b 1

pushd frontend
call npm ci || (
  popd
  exit /b 1
)
popd

if not exist "backend\.env" copy "backend\.env.example" "backend\.env" >nul

echo.
echo Aether Vision is ready (%PROFILE%).
echo Run run.bat, or use "docker compose up --build" for the full stack.
