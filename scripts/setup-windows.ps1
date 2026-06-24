# Setup de herramientas que requieren privilegios de administrador (UAC).
# Ejecutar UNA VEZ, en una terminal "PowerShell como Administrador".
#
#   Click derecho en PowerShell → "Ejecutar como administrador", luego:
#   cd "C:\Users\Jamet\Documents\DEV\Meet Record"; .\scripts\setup-windows.ps1
#
# Esto desbloquea:
#  - Compilación del binario de captura Rust (linker MSVC)
#  - Recompilación de better-sqlite3 para el ABI de Electron
#  - (Opcional) descarga del modelo de Ollama

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host "== 1/4: Visual Studio Build Tools (C++) ==" -ForegroundColor Cyan
winget install --id Microsoft.VisualStudio.2022.BuildTools -e `
  --accept-source-agreements --accept-package-agreements `
  --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --includeRecommended"

Write-Host "== 2/4: Compilar binario de captura Rust ==" -ForegroundColor Cyan
Push-Location "$root\native"
cargo build --release
Pop-Location

Write-Host "== 3/4: Recompilar better-sqlite3 para Electron ==" -ForegroundColor Cyan
Push-Location $root
npm install better-sqlite3
npx electron-rebuild -f -w better-sqlite3
Pop-Location

Write-Host "== 4/4: (Opcional) Modelo de Ollama ==" -ForegroundColor Cyan
Write-Host "Para descargar el LLM por defecto (qwen3:8b, ~5 GB) ejecuta:" -ForegroundColor Yellow
Write-Host "    ollama pull qwen3:8b" -ForegroundColor Yellow

Write-Host "`nListo. Ahora puedes: npm run dev" -ForegroundColor Green
