# 7Server Windows PowerShell Installer
# Installs Node 22+ if missing, downloads the latest GitHub Release tarball,
# sets up $HOME\.7server\app and $HOME\.7server\bin\7server.cmd, and adds to PATH.
# Usage:
#   irm https://raw.githubusercontent.com/nannndev/7server/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

$Repo = "nannndev/7server"
$InstallDir = Join-Path $HOME ".7server\app"
$BinDir = Join-Path $HOME ".7server\bin"
$DataDir = Join-Path $HOME ".7server"
$Port = if ($env:SEVENSERVER_PORT) { $env:SEVENSERVER_PORT } else { "5001" }
$HostAddr = if ($env:SEVENSERVER_HOST) { $env:SEVENSERVER_HOST } else { "127.0.0.1" }

function Write-Log ($msg) { Write-Host "==> $msg" -ForegroundColor Green }
function Write-Warn ($msg) { Write-Host "! $msg" -ForegroundColor Yellow }
function Write-Err ($msg) { Write-Host "x $msg" -ForegroundColor Red; exit 1 }

# 1. Check Node.js >= 22.13
Write-Log "Checking Node.js environment..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Warn "Node.js not found on this system."
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        Write-Log "Installing Node.js 22 LTS via winget..."
        & winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } else {
        Write-Err "Please install Node.js 22 LTS (https://nodejs.org) and run this installer again."
    }
}

try {
    $nodeVer = & node -v
    $verMatch = $nodeVer -replace '^v',''
    $parts = $verMatch.Split('.')
    $maj = [int]$parts[0]
    $min = [int]$parts[1]
    if ($maj -lt 22 -or ($maj -eq 22 -and $min -lt 13)) {
        Write-Err "Found Node.js $nodeVer, but 7Server requires Node.js >= 22.13.0. Please upgrade Node.js."
    }
    Write-Log "Found Node.js $nodeVer (compatible)"
} catch {
    Write-Err "Could not verify Node.js version. Please ensure Node.js >= 22.13 is in your PATH."
}

# 2. Resolve latest version
Write-Log "Resolving latest 7Server release from GitHub..."
$apiUrl = "https://api.github.com/repos/$Repo/releases/latest"
try {
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "7Server-Installer" }
    $version = ($release.tag_name -replace '^v','')
} catch {
    Write-Err "Could not resolve latest release version from GitHub."
}

Write-Log "Target version: v$version"

# 3. Download tarball
$tarballUrl = "https://github.com/$Repo/releases/download/v${version}/nannndev-7server-${version}.tgz"
$legacyUrl = "https://github.com/$Repo/releases/download/v${version}/sevenserver-${version}.tgz"
$tempTgz = [System.IO.Path]::GetTempFileName() + ".tgz"

Write-Log "Downloading 7Server package..."
try {
    Invoke-WebRequest -Uri $tarballUrl -OutFile $tempTgz -UseBasicParsing
} catch {
    Write-Log "Trying fallback tarball location..."
    try {
        Invoke-WebRequest -Uri $legacyUrl -OutFile $tempTgz -UseBasicParsing
    } catch {
        Write-Err "Failed to download 7Server release tarball."
    }
}

# 4. Extract into app directory
Write-Log "Installing into $InstallDir..."
$newAppDir = Join-Path $HOME ".7server\app_new"
if (Test-Path $newAppDir) { Remove-Item -Recurse -Force $newAppDir }
New-Item -ItemType Directory -Path $newAppDir -Force | Out-Null
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null

try {
    tar -xzf $tempTgz --strip-components=1 -C $newAppDir
} catch {
    Write-Err "Failed to extract tarball. Ensure tar (built into Windows 10/11) is available."
} finally {
    if (Test-Path $tempTgz) { Remove-Item -Force $tempTgz }
}

# Install dependencies if needed
Push-Location $newAppDir
try {
    & npm install --omit=dev --no-audit --no-fund *>$null
} catch {}
Pop-Location

# Swap directory
if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
Move-Item -Path $newAppDir -Destination $InstallDir -Force

# 5. Create launcher scripts in bin
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
$cmdScript = Join-Path $BinDir "7server.cmd"
$psScript = Join-Path $BinDir "7server.ps1"
$jsLauncher = Join-Path $InstallDir "bin\7server.js"

"@echo off`r`nnode `"$jsLauncher`" %*`r`n" | Set-Content -Path $cmdScript -Encoding Ascii
"& node `"$jsLauncher`" @args`r`n" | Set-Content -Path $psScript -Encoding Ascii

# 6. Ensure bin directory is in User PATH
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
    Write-Log "Adding $BinDir to User PATH..."
    [System.Environment]::SetEnvironmentVariable("Path", "$BinDir;$userPath", "User")
    $env:Path = "$BinDir;$env:Path"
}

Write-Log "7Server v$version installed successfully!"
Write-Host ""
Write-Host "  To start 7Server anytime, type:" -ForegroundColor Cyan
Write-Host "    7server" -ForegroundColor White
Write-Host ""
Write-Host "  To update in the future, type:" -ForegroundColor Cyan
Write-Host "    7server update" -ForegroundColor White
Write-Host ""
Write-Log "Launching 7Server on http://${HostAddr}:${Port}..."
& node "$jsLauncher" --host $HostAddr --port $Port
