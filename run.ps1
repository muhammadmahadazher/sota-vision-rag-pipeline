# Aether Vision RAG Concurrent Launcher (Windows)
$ErrorActionPreference = "Stop"

# Set the Qdrant storage path environment variable
$env:QDRANT__STORAGE__STORAGE_PATH = "database/data"

# Load backend/.env environment variables
if (Test-Path "backend/.env") {
    Get-Content "backend/.env" | ForEach-Object {
        if ($_ -match "^\s*([^#=]+)\s*=\s*(.*)\s*$") {
            $name = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($name, $value)
        }
    }
}

# Check if QDRANT_URL is set, otherwise default it
if ([string]::IsNullOrEmpty($env:QDRANT_URL)) {
    $env:QDRANT_URL = "http://localhost:6333"
}

echo "=================================================="
echo "AETHER VISION RAG - LAUNCHING SERVICES"
echo "=================================================="

# 1. Start Qdrant Standalone Binary
echo "[STATUS] Launching Qdrant Database (Port 6333)..."
$qdrantPath = "database\bin\qdrant.exe"
if (-not (Test-Path $qdrantPath)) {
    echo "[ERROR] Qdrant binary not found at $qdrantPath. Please run setup.bat first."
    Exit 1
}
$qdrantProcess = Start-Process -FilePath $qdrantPath -PassThru -NoNewWindow

# 2. Start FastAPI Backend
echo "[STATUS] Launching FastAPI Backend (Port 8000)..."
$backendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c .venv\Scripts\activate && cd backend && uvicorn main:app --host 127.0.0.1 --port 8000" -PassThru -NoNewWindow

# 3. Start Next.js Frontend
echo "[STATUS] Launching Next.js Frontend (Port 3000)..."
$frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd frontend && npm run dev -- --port 3000" -PassThru -NoNewWindow

echo "--------------------------------------------------"
echo "All processes started successfully."
echo "Access the UI at: http://localhost:3000"
echo "Press CTRL+C in this terminal window to stop all services."
echo "--------------------------------------------------"

# Clean termination logic
$cleanup = {
    echo "`n[STATUS] Terminating all background processes..."
    
    if ($qdrantProcess -and -not $qdrantProcess.HasExited) {
        Stop-Process -Id $qdrantProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    echo "[STATUS] Port configurations cleared. Shutdown complete."
}

try {
    # Keep the console alive and monitor processes
    while ($true) {
        if ($qdrantProcess.HasExited) {
            echo "[WARN] Qdrant database process exited unexpectedly."
            break
        }
        if ($backendProcess.HasExited) {
            echo "[WARN] FastAPI backend process exited unexpectedly."
            break
        }
        if ($frontendProcess.HasExited) {
            echo "[WARN] Next.js frontend process exited unexpectedly."
            break
        }
        Start-Sleep -Seconds 1
    }
} finally {
    & $cleanup
}
