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
$requirementsName = if ($Profile -eq "advanced") { "requirements-advanced.txt" } else { "requirements.txt" }
$requirementsPath = Join-Path $backendPath $requirementsName
$packageJsonPath = Join-Path $frontendPath "package.json"
$packageLockPath = Join-Path $frontendPath "package-lock.json"
$localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$projectHasher = [System.Security.Cryptography.SHA256]::Create()
try {
    $projectHashBytes = $projectHasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant()))
}
finally {
    $projectHasher.Dispose()
}
$cacheKey = ([System.BitConverter]::ToString($projectHashBytes)).Replace("-", "").Substring(0, 16)
$dependencyCacheRoot = Join-Path (Join-Path $localAppData "AetherVision\environments") $cacheKey
$venvCachePath = Join-Path $dependencyCacheRoot "python"
$nodeWorkspacePath = Join-Path $dependencyCacheRoot "frontend"
$nodeModulesCachePath = Join-Path $nodeWorkspacePath "node_modules"
$legacyVenvPath = Join-Path $projectRoot ".venv"
$legacyNodeModulesPath = Join-Path $frontendPath "node_modules"
$legacyNextPath = Join-Path $frontendPath ".next"
$venvPath = $venvCachePath
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$nodeModulesPath = $nodeModulesCachePath
$statePath = Join-Path $projectRoot ".aether"
$stampPath = Join-Path $statePath "setup-$Profile.sha256"
$cachePointerPath = Join-Path $statePath "dependency-cache.txt"
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

function Remove-LegacyGeneratedDirectory {
    param(
        [string]$Path,
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) { return }
    $resolvedPath = [IO.Path]::GetFullPath($Path)
    $resolvedRoot = [IO.Path]::GetFullPath($projectRoot).TrimEnd("\") + "\"
    if (-not $resolvedPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove $Label outside the repository: $resolvedPath"
    }

    Write-Host "Removing the old synced-drive $Label; the replacement is stored in LocalAppData..." -ForegroundColor DarkCyan
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

function Sync-FrontendWorkspace {
    $resolvedCacheRoot = [IO.Path]::GetFullPath($dependencyCacheRoot).TrimEnd("\") + "\"
    $resolvedDestination = [IO.Path]::GetFullPath($nodeWorkspacePath)
    if (-not $resolvedDestination.StartsWith($resolvedCacheRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to synchronize the frontend outside the dependency cache: $resolvedDestination"
    }

    New-Item -ItemType Directory -Path $nodeWorkspacePath -Force | Out-Null
    & robocopy.exe $frontendPath $nodeWorkspacePath /MIR /FFT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP /XD node_modules .next out
    $robocopyExitCode = $LASTEXITCODE
    $global:LASTEXITCODE = 0
    if ($robocopyExitCode -ge 8) {
        throw "Frontend cache synchronization failed with robocopy exit code $robocopyExitCode."
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
Remove-LegacyGeneratedDirectory -Path $legacyVenvPath -Label "Python environment"
Remove-LegacyGeneratedDirectory -Path $legacyNodeModulesPath -Label "frontend dependencies"
Remove-LegacyGeneratedDirectory -Path $legacyNextPath -Label "frontend build output"
Sync-FrontendWorkspace

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
        Invoke-Checked -FilePath "python" -Arguments @("-m", "venv", $venvCachePath) -FailureMessage "Python virtual environment creation failed"
    }
    Invoke-Checked -FilePath $venvPython -Arguments @("-m", "pip", "install", "--upgrade", "pip") -FailureMessage "pip upgrade failed"
    Invoke-Checked -FilePath $venvPython -Arguments @("-m", "pip", "install", "-r", $requirementsPath) -FailureMessage "Backend dependency installation failed"

    Write-Host "[2/3] Installing pinned frontend dependencies..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $nodeWorkspacePath -Force | Out-Null
    Copy-Item -LiteralPath $packageJsonPath -Destination (Join-Path $nodeWorkspacePath "package.json") -Force
    Copy-Item -LiteralPath $packageLockPath -Destination (Join-Path $nodeWorkspacePath "package-lock.json") -Force
    Push-Location $nodeWorkspacePath
    try {
        Invoke-Checked -FilePath "npm.cmd" -Arguments @(
            "install",
            "--prefer-offline",
            "--no-audit",
            "--no-fund"
        ) -FailureMessage "Frontend dependency installation failed"
    }
    finally {
        Pop-Location
    }

    Write-Host "[3/3] Saving the verified setup state..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $statePath -Force | Out-Null
    [System.IO.File]::WriteAllText($stampPath, $signature, [System.Text.UTF8Encoding]::new($false))
}

New-Item -ItemType Directory -Path $statePath -Force | Out-Null
[System.IO.File]::WriteAllText($cachePointerPath, $dependencyCacheRoot, [System.Text.UTF8Encoding]::new($false))

if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath $exampleEnvPath -Destination $envPath
}

Write-Host ""
Write-Host "Aether Vision is ready ($requirementsName)." -ForegroundColor Green
Write-Host "PowerShell:    .\run.bat"
Write-Host "Command Prompt: run.bat"
Write-Host "The launcher waits for both services and opens the dashboard automatically."
Write-Host "Dependency cache: $dependencyCacheRoot"
