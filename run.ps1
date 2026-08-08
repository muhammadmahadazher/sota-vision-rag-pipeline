$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"
$backendPath = Join-Path $projectRoot "backend"
$frontendPath = Join-Path $projectRoot "frontend"
$envPath = Join-Path $backendPath ".env"
$exampleEnvPath = Join-Path $backendPath ".env.example"

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "Missing .venv. Run setup.bat first."
}
if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath $exampleEnvPath -Destination $envPath
}

$backend = Start-Process -FilePath $pythonPath -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--env-file", ".env" -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru
$frontend = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000" -WorkingDirectory $frontendPath -WindowStyle Hidden -PassThru

Write-Host "Aether Vision: http://127.0.0.1:3000"
Write-Host "API docs:      http://127.0.0.1:8000/docs"
Write-Host "Press Ctrl+C to stop both services."

try {
    while (-not $backend.HasExited -and -not $frontend.HasExited) {
        Start-Sleep -Seconds 1
    }
    if ($backend.HasExited) { throw "Backend exited with code $($backend.ExitCode)." }
    if ($frontend.HasExited) { throw "Frontend exited with code $($frontend.ExitCode)." }
}
finally {
    foreach ($process in @($backend, $frontend)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
        }
    }
}
