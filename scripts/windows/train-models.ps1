param(
    [string]$Data = 'data/extention of Z-Alizadeh sani   dataset.xlsx',
    [string]$Output = 'models'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$pythonExe = Join-Path $root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $pythonExe)) { throw 'Run .\scripts\windows\setup.ps1 first.' }
if (-not [System.IO.Path]::IsPathRooted($Data)) { $Data = Join-Path $root $Data }
if (-not [System.IO.Path]::IsPathRooted($Output)) { $Output = Join-Path $root $Output }
Push-Location $root
try { & $pythonExe -m backend.train --data $Data --output $Output } finally { Pop-Location }
