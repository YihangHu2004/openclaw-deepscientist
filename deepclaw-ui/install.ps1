# DeepClaw UI — One-click install script (Windows PowerShell)
# Usage: .\install.ps1 [-Dev] [-Port 19000]

param(
    [switch]$Dev,            # Start in dev mode (hot reload, client on port 3000)
    [int]$Port = 0,          # Override UI port (default: 19000)
    [switch]$NoBuild,        # Skip Next.js production build
    [switch]$NoStart         # Install only, don't start the server
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

function Write-Step { param($Msg) Write-Host "`n  $Msg" -ForegroundColor Cyan }
function Write-OK   { param($Msg) Write-Host "  OK  $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "  !!  $Msg" -ForegroundColor Yellow }
function Write-Fail { param($Msg) Write-Host "  ERR $Msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  DeepClaw UI — Install" -ForegroundColor White
Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────

Write-Step "Checking Node.js..."
try {
    $nodeVer = node --version 2>&1
    if (-not $nodeVer) { throw "not found" }
    $major = [int]($nodeVer -replace 'v(\d+)\..*', '$1')
    if ($major -lt 18) { Write-Fail "Node.js $nodeVer is too old. Requires >= 18. Download: https://nodejs.org" }
    Write-OK "Node.js $nodeVer"
} catch {
    Write-Fail "Node.js not found. Download from https://nodejs.org (v18+)"
}

# ── 2. Check OpenClaw ─────────────────────────────────────────────────────────

Write-Step "Checking OpenClaw installation..."
$openclawHome = Join-Path $env:USERPROFILE ".openclaw"
if (-not (Test-Path $openclawHome)) {
    Write-Warn ".openclaw directory not found at $openclawHome"
    Write-Warn "Make sure OpenClaw is installed and has run at least once."
} else {
    $configFile = Join-Path $openclawHome "openclaw.json"
    if (Test-Path $configFile) {
        $cfg = Get-Content $configFile | ConvertFrom-Json
        $gwPort = $cfg.gateway.port
        if ($gwPort) { Write-OK "OpenClaw config found (gateway port: $gwPort)" }
        else { Write-OK "OpenClaw config found" }
    } else {
        Write-Warn "openclaw.json not found — start OpenClaw once before running DeepClaw UI"
    }
}

# ── 3. Install server dependencies ────────────────────────────────────────────

Write-Step "Installing server dependencies..."
$serverDir = Join-Path $Root "server"
if (-not (Test-Path $serverDir)) { Write-Fail "server/ directory not found. Run this script from the deepclaw-ui root." }

Push-Location $serverDir
try {
    npm install --prefer-offline 2>&1 | Out-Null
    Write-OK "server/node_modules ready"
} catch {
    npm install 2>&1 | Out-Null
    Write-OK "server/node_modules ready"
} finally {
    Pop-Location
}

# ── 4. Install client dependencies ───────────────────────────────────────────

Write-Step "Installing client dependencies..."
$clientDir = Join-Path $Root "client"
if (-not (Test-Path $clientDir)) { Write-Fail "client/ directory not found." }

Push-Location $clientDir
try {
    npm install --prefer-offline 2>&1 | Out-Null
    Write-OK "client/node_modules ready"
} catch {
    npm install 2>&1 | Out-Null
    Write-OK "client/node_modules ready"
} finally {
    Pop-Location
}

# ── 5. Build Next.js (production) ────────────────────────────────────────────

if (-not $Dev -and -not $NoBuild) {
    Write-Step "Building Next.js frontend (this may take ~60 seconds)..."
    Push-Location $clientDir
    try {
        $env:NEXT_TELEMETRY_DISABLED = "1"
        npm run build
        Write-OK "Frontend built successfully"
    } catch {
        Write-Warn "Build failed. You can still use dev mode: .\install.ps1 -Dev"
    } finally {
        Pop-Location
    }
}

# ── 6. Apply custom port if specified ────────────────────────────────────────

if ($Port -gt 0) {
    $env:DEEPCLAW_UI_PORT = "$Port"
    Write-OK "UI port set to $Port"
}

# ── 7. Start ──────────────────────────────────────────────────────────────────

if ($NoStart) {
    Write-Host ""
    Write-Host "  Installation complete." -ForegroundColor Green
    Write-Host "  Start the server:  node server/index.js" -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

$uiPort = if ($Port -gt 0) { $Port } else { 19000 }

Write-Host ""
Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray

if ($Dev) {
    # Dev mode: server auto-spawns Next.js in dev mode (no build found → uses `next dev`).
    # Delete BUILD_ID so the server picks dev mode even if a stale build exists.
    $buildId = Join-Path $clientDir ".next" "BUILD_ID"
    if (Test-Path $buildId) { Remove-Item $buildId -Force; Write-OK "Cleared stale build — server will start Next.js in dev mode" }

    Write-Host "  Starting in DEV mode  (hot reload)" -ForegroundColor Cyan
    Write-Host "  Open: http://127.0.0.1:$uiPort" -ForegroundColor White
    Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
    Write-Host ""
    Push-Location $serverDir
    node index.js
} else {
    Write-Host "  Starting DeepClaw UI..." -ForegroundColor Cyan
    Write-Host "  http://127.0.0.1:$uiPort" -ForegroundColor White
    Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
    Write-Host ""

    Push-Location $serverDir
    node index.js
}
