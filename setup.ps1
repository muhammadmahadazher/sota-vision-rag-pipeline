[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("standard", "advanced")]
    [string]$Profile = "standard",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPath = Join-Path $projectRoot "frontend"
$backendPath = Join-Path $projectRoot "backend"
$venvPath = Join-Path $projectRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$requirementsName = if ($Profile -eq "advanced") { "requirements-advanced.txt" } else { "requirements.txt" }
$requirementsPath = Join-Path $backendPath $requirementsName
$packageLockPath = Join-Path $frontendPath "package-lock.json"
$nodeModulesPath = Join-Path $frontendPath "node_modules"
$statePath = Join-Path $projectRoot ".aether"
$stampPath = Join-Path $statePath "setup-$Profile.sha256"
$envPath = Join-Path $backendPath ".env"
$exampleEnvPath = Join-Path $backendPath ".env.example"

function Invoke-Checked {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$FailureMessage
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (exit code $LASTEXITCODE)."
    }
}

function Get-FileSha256 {
    param([string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "")
        }
        finally {
            $sha256.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Get-SetupSignature {
    $signatureFiles = @($requirementsPath, $packageLockPath)
    if ($Profile -eq "advanced") {
        $signatureFiles = @(
            (Join-Path $backendPath "requirements.txt"),
            $requirementsPath,
            $packageLockPath
        )
    }
    $hashes = @($signatureFiles | ForEach-Object { Get-FileSha256 -Path $_ })
    return "$Profile-$($hashes -join '-')"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 20.9 or newer is required. Install it from https://nodejs.org and reopen PowerShell."
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python 3.12 or newer is required. Install it from https://python.org and reopen PowerShell."
}

Invoke-Checked -FilePath "node" -Arguments @("-e", "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>20||(major===20&&minor>=9)?0:1)") -FailureMessage "Node.js 20.9 or newer is required"
Invoke-Checked -FilePath "python" -Arguments @("-c", "import sys; raise SystemExit(sys.version_info < (3, 12))") -FailureMessage "Python 3.12 or newer is required"

$signature = Get-SetupSignature
$installedSignature = if (Test-Path -LiteralPath $stampPath) {
    (Get-Content -LiteralPath $stampPath -Raw).Trim()
} else {
    ""
}

if (
    -not $Force -and
    (Test-Path -LiteralPath $venvPython) -and
    (Test-Path -LiteralPath $nodeModulesPath) -and
    $installedSignature -eq $signature
) {
    Write-Host "Aether Vision dependencies are already up to date ($Profile)." -ForegroundColor Green
} else {
    Write-Host "[1/3] Preparing Python $Profile environment..." -ForegroundColor Cyan
    if (-not (Test-Path -LiteralPath $venvPython)) {
        Invoke-Checked -FilePath "python" -Arguments @("-m", "venv", $venvPath) -FailureMessage "Python virtual environment creation failed"
    }
    Invoke-Checked -FilePath $venvPython -Arguments @("-m", "pip", "install", "--upgrade", "pip") -FailureMessage "pip upgrade failed"
    Invoke-Checked -FilePath $venvPython -Arguments @("-m", "pip", "install", "-r", $requirementsPath) -FailureMessage "Backend dependency installation failed"

    Write-Host "[2/3] Installing pinned frontend dependencies..." -ForegroundColor Cyan
    Push-Location $frontendPath
    try {
        Invoke-Checked -FilePath "npm.cmd" -Arguments @("ci") -FailureMessage "Frontend dependency installation failed"
    }
    finally {
        Pop-Location
    }

    Write-Host "[3/3] Saving the verified setup state..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $statePath -Force | Out-Null
    [System.IO.File]::WriteAllText($stampPath, $signature, [System.Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath $exampleEnvPath -Destination $envPath
}

Write-Host ""
Write-Host "Aether Vision is ready ($requirementsName)." -ForegroundColor Green
Write-Host "PowerShell:    .\run.bat"
Write-Host "Command Prompt: run.bat"
Write-Host "The launcher waits for both services and opens the dashboard automatically."
