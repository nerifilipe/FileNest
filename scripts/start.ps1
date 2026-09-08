param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    Write-Host 'Falta o ambiente Python. Na raiz do projeto, execute:' -ForegroundColor Yellow
    Write-Host 'py -m venv .venv'
    Write-Host '.\.venv\Scripts\python -m pip install -r backend/requirements-lock.txt'
    exit 1
}
$launcherPath = Join-Path $PSScriptRoot 'launch.py'
if ($CheckOnly) { & $pythonPath -X utf8 $launcherPath --check }
else { & $pythonPath -X utf8 $launcherPath }
exit $LASTEXITCODE
