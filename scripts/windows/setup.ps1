$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

Write-Host 'CardioMap local setup' -ForegroundColor Cyan
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python is required. Install Python 3.12 or newer, then rerun the setup script.' }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'pnpm 11.19.0 is required. Install Node.js 22+ and run npm install --global pnpm@11.19.0.' }
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)"
if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 or newer is required to keep training and inference environments compatible.' }
$nodeVersion = (node --version).TrimStart('v').Split('.')[0]
if ([int]$nodeVersion -lt 22) { throw 'Node.js 22 or newer is required.' }
if ((pnpm --version).Trim() -ne '11.19.0') { throw 'Use pnpm 11.19.0 to match the project lockfile.' }

$venv = Join-Path $root 'backend\.venv'
if (-not (Test-Path $venv)) { python -m venv $venv }
$pythonExe = Join-Path $venv 'Scripts\python.exe'
& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install -r (Join-Path $root 'backend\requirements.txt')
Push-Location (Join-Path $root 'frontend')
try { pnpm install --frozen-lockfile } finally { Pop-Location }

Write-Host ''
Write-Host 'Dependencies installed. Start the API and web app in separate terminals:' -ForegroundColor Green
Write-Host '  .\scripts\windows\start-api.ps1'
Write-Host '  .\scripts\windows\start-web.ps1'
Write-Host 'The default Excel dataset is expected at .\data\extention of Z-Alizadeh sani   dataset.xlsx.'
