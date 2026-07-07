@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo AETHER VISION RAG - WINDOWS SYSTEM SETUP
echo ==========================================

:: 1. Verify Node.js
node -v >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] Node.js is not found. Please install Node.js (v18+) to run the frontend.
    exit /b 1
)
echo [OK] Node.js is available.

:: 2. Verify Python 3.12+
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] Python 3.12+ is required but not found or not default.
    echo Please ensure Python 3.12 or newer is installed and added to your PATH.
    exit /b 1
)
echo [OK] Python 3.12+ is available.

:: 3. Initialize Isolated Virtual Environment
echo.
echo [STATUS] Creating isolated virtual environment (.venv)...
if not exist .venv (
    python -m venv .venv
)
echo [STATUS] Activating virtual environment...
call .venv\Scripts\activate

echo [STATUS] Upgrading pip...
python -m pip install --upgrade pip

echo [STATUS] Installing Python dependencies...
pip install -r backend/requirements.txt
if !errorlevel! neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    exit /b 1
)
echo [OK] Python dependencies installed successfully.

:: 4. Download and Extract Standalone Qdrant Binary
echo.
echo [STATUS] Creating database directory...
if not exist database\bin mkdir database\bin
if not exist database\data mkdir database\data

echo [STATUS] Downloading standalone Qdrant binary from GitHub...
set QDRANT_URL=https://github.com/qdrant/qdrant/releases/download/v1.12.0/qdrant-x86_64-pc-windows-msvc.zip
set ZIP_FILE=database\qdrant.zip

powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '!QDRANT_URL!' -OutFile '!ZIP_FILE!'"
if !errorlevel! neq 0 (
    echo [ERROR] Failed to download Qdrant. Please check your internet connection.
    exit /b 1
)

echo [STATUS] Extracting Qdrant binary to database\bin...
powershell -ExecutionPolicy Bypass -Command "Expand-Archive -Path '!ZIP_FILE!' -DestinationPath 'database\bin' -Force"
if !errorlevel! neq 0 (
    echo [ERROR] Failed to extract Qdrant zip archive.
    exit /b 1
)

echo [STATUS] Cleaning up archives...
if exist !ZIP_FILE! del /q !ZIP_FILE!
echo [OK] Qdrant binary prepared at database\bin\qdrant.exe.

:: 5. Frontend Package Setup
echo.
echo [STATUS] Installing frontend dependencies...
cd frontend
call npm install
if !errorlevel! neq 0 (
    echo [ERROR] Frontend npm install failed.
    exit /b 1
)
cd ..
echo [OK] Frontend dependencies installed.

echo.
echo ==========================================
echo [SUCCESS] System Setup Complete!
echo Run 'run.bat' to launch the Vision RAG application.
echo ==========================================
pause
