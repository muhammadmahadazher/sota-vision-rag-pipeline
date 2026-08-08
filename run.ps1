[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$SmokeTest,
    [ValidateRange(30, 300)]
    [int]$StartupTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"
$backendPath = Join-Path $projectRoot "backend"
$frontendPath = Join-Path $projectRoot "frontend"
$envPath = Join-Path $backendPath ".env"
$exampleEnvPath = Join-Path $backendPath ".env.example"
$logPath = Join-Path $projectRoot ".aether\logs"
$backendOutput = Join-Path $logPath "backend.out.log"
$backendError = Join-Path $logPath "backend.error.log"
$frontendOutput = Join-Path $logPath "frontend.out.log"
$frontendError = Join-Path $logPath "frontend.error.log"
$frontendUrl = "http://127.0.0.1:3000"
$healthUrl = "http://127.0.0.1:8000/health"
$docsUrl = "http://127.0.0.1:8000/docs"

function Assert-PortAvailable {
    param([int]$Port)

    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($listener) {
        throw "Port $Port is already in use by process $($listener.OwningProcess). Stop that process, then run .\run.bat again."
    }
}

function Write-LogTail {
    param(
        [string]$Label,
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) { return }
    $lines = @(Get-Content -LiteralPath $Path -Tail 35 -ErrorAction SilentlyContinue)
    if (-not $lines.Count) { return }
    Write-Host ""
    Write-Host "$Label log ($Path)" -ForegroundColor Yellow
    $lines | ForEach-Object { Write-Host $_ }
}

function Stop-ProcessTree {
    param([int]$ProcessId)

    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId $child.ProcessId
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Wait-ForEndpoint {
    param(
        [string]$Name,
        [string]$Url,
        [System.Diagnostics.Process[]]$Processes
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    $lastProgress = [DateTime]::MinValue
    while ([DateTime]::UtcNow -lt $deadline) {
        foreach ($process in $Processes) {
            if (-not $process) { continue }
            $process.Refresh()
            if ($process.HasExited) {
                throw "$Name could not start because process $($process.Id) exited with code $($process.ExitCode)."
            }
        }

        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                Write-Host " ready" -ForegroundColor Green
                return
            }
        }
        catch {
            # Compilation and model initialization can take a little while on first run.
        }

        if (([DateTime]::UtcNow - $lastProgress).TotalSeconds -ge 2) {
            Write-Host "." -NoNewline
            $lastProgress = [DateTime]::UtcNow
        }
        Start-Sleep -Milliseconds 400
    }
    throw "$Name did not become ready within $StartupTimeoutSeconds seconds."
}

Write-Host "Checking local dependencies..." -ForegroundColor DarkCyan
& (Join-Path $projectRoot "setup.ps1") -Profile standard
if ($LASTEXITCODE -ne 0) {
    throw "Automatic setup failed with exit code $LASTEXITCODE."
}
if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath $exampleEnvPath -Destination $envPath
}

Assert-PortAvailable -Port 8000
Assert-PortAvailable -Port 3000
New-Item -ItemType Directory -Path $logPath -Force | Out-Null

$backend = $null
$frontend = $null
try {
    Write-Host "Starting Aether Vision..." -ForegroundColor Cyan
    $backend = Start-Process -FilePath $pythonPath `
        -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--env-file", ".env" `
        -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $backendOutput -RedirectStandardError $backendError

    $frontend = Start-Process -FilePath "npm.cmd" `
        -ArgumentList "run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000" `
        -WorkingDirectory $frontendPath -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $frontendOutput -RedirectStandardError $frontendError

    Write-Host "Backend" -NoNewline
    Wait-ForEndpoint -Name "Backend" -Url $healthUrl -Processes @($backend, $frontend)
    Write-Host "Frontend" -NoNewline
    Wait-ForEndpoint -Name "Frontend" -Url $frontendUrl -Processes @($backend, $frontend)

    Write-Host ""
    Write-Host "Aether Vision is ready." -ForegroundColor Green
    Write-Host "Dashboard: $frontendUrl"
    Write-Host "API docs:  $docsUrl"
    Write-Host "Logs:      $logPath"
    Write-Host "Press Ctrl+C to stop both services."

    if ($SmokeTest) {
        $dashboard = Invoke-WebRequest -UseBasicParsing -Uri $frontendUrl -TimeoutSec 10
        if (-not $dashboard.Content.Contains(".\setup.bat") -or -not $dashboard.Content.Contains(".\run.bat")) {
            throw "Dashboard loaded but did not contain the Windows quick-start commands."
        }
        Write-Host "Dashboard content verified; stopping services." -ForegroundColor Green
        return
    }

    if (-not $NoBrowser -and $env:AETHER_NO_BROWSER -ne "1") {
        Start-Process $frontendUrl | Out-Null
    }

    while ($true) {
        $backend.Refresh()
        $frontend.Refresh()
        if ($backend.HasExited) { throw "Backend exited with code $($backend.ExitCode)." }
        if ($frontend.HasExited) { throw "Frontend exited with code $($frontend.ExitCode)." }
        Start-Sleep -Seconds 1
    }
}
catch {
    Write-Host ""
    Write-Host "Aether Vision failed to start: $($_.Exception.Message)" -ForegroundColor Red
    Write-LogTail -Label "Backend" -Path $backendError
    Write-LogTail -Label "Frontend" -Path $frontendError
    Write-Host ""
    Write-Host "Detailed logs are in $logPath" -ForegroundColor Yellow
    throw
}
finally {
    foreach ($process in @($frontend, $backend)) {
        if ($process) { Stop-ProcessTree -ProcessId $process.Id }
    }
}
