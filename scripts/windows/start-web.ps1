$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
if (-not (Test-Path (Join-Path $root 'frontend\node_modules'))) { throw 'Run .\scripts\windows\setup.ps1 first.' }
Push-Location (Join-Path $root 'frontend')
try { pnpm run dev } finally { Pop-Location }
