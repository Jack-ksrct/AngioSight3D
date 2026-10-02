$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$pythonExe = Join-Path $root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $pythonExe)) { throw 'Run .\scripts\windows\setup.ps1 first.' }
$env:MODEL_DIR = Join-Path $root 'models'
if (-not $env:ENABLE_API_DOCS) { $env:ENABLE_API_DOCS = 'true' }
Push-Location $root
try { & $pythonExe -m uvicorn backend.app.main:app --host 127.0.0.1 --reload --port 8000 } finally { Pop-Location }
