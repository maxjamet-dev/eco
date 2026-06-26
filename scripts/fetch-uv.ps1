# Descarga uv.exe a resources/ si no existe (no se versiona; ver .gitignore).
# Se ejecuta automáticamente antes de empaquetar (npm run package / release).
$ErrorActionPreference = 'Stop'
$dest = Join-Path $PSScriptRoot '..\resources\uv.exe'
if (Test-Path $dest) {
  Write-Host 'uv.exe ya está en resources/.'
  exit 0
}
$tmp = Join-Path $env:TEMP 'uv-eco.zip'
$ex = Join-Path $env:TEMP 'uv-eco'
Write-Host 'Descargando uv.exe…'
Invoke-WebRequest -Uri 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip' -OutFile $tmp
Expand-Archive -Path $tmp -DestinationPath $ex -Force
Copy-Item (Join-Path $ex 'uv.exe') $dest -Force
Remove-Item $tmp, $ex -Recurse -Force
Write-Host 'uv.exe descargado en resources/.'
