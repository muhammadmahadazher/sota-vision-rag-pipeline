@echo off
setlocal enabledelayedexpansion

:: 1. Verify environment configuration
set ENV_PATH=backend\.env

if not exist !ENV_PATH! (
    echo [STATUS] Creating backend\.env from boilerplate...
    echo QDRANT_URL=http://localhost:6333> !ENV_PATH!
    echo GEMINI_API_KEY=>> !ENV_PATH!
)

:: 2. Read GEMINI_API_KEY from backend\.env
set GEMINI_KEY=
for /f "tokens=1,2 delims==" %%i in (!ENV_PATH!) do (
    if "%%i"=="GEMINI_API_KEY" set GEMINI_KEY=%%j
)

:: Trim quotes and spaces if any
if not "!GEMINI_KEY!"=="" (
    set GEMINI_KEY=!GEMINI_KEY:"=!
    set GEMINI_KEY=!GEMINI_KEY: =!
)

:: 3. Prompt user for GEMINI_API_KEY only once if missing
if "!GEMINI_KEY!"=="" (
    echo.
    echo ==================================================
    echo [PROMPT] AETHER VISION RAG: GEMINI_API_KEY Required
    echo ==================================================
    set /p USER_KEY="Please enter your GEMINI_API_KEY: "
    
    :: Re-write the backend\.env with the input API key and hardcoded Qdrant url
    echo QDRANT_URL=http://localhost:6333> !ENV_PATH!
    echo GEMINI_API_KEY=!USER_KEY!>> !ENV_PATH!
)

:: 4. Force standalone Qdrant URL configuration internally
:: (Ensures QDRANT_URL=http://localhost:6333 is bound without prompting)
:: We rewrite it to guarantee QDRANT_URL is set correctly.
type !ENV_PATH! | findstr /V "QDRANT_URL" > !ENV_PATH!.tmp
echo QDRANT_URL=http://localhost:6333>> !ENV_PATH!.tmp
move /y !ENV_PATH!.tmp !ENV_PATH! >nul

:: 5. Launch services concurrently using powershell wrapper
powershell -ExecutionPolicy Bypass -File "%~dp0run.ps1"
pause
