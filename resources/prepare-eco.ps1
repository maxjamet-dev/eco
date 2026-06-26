# Prepara el entorno de IA de eco (whisperX + pyannote) en %APPDATA%/eco/runtime.
# Usa `uv`, que provisiona Python 3.12 automáticamente y crea el venv (igual que el
# entorno de desarrollo del repo). Lo lanza el asistente "Preparar eco", pero también
# se puede correr a mano para depurar:
#   powershell -ExecutionPolicy Bypass -File resources\prepare-eco.ps1 -DataDir "$env:APPDATA\eco" -Device cuda
#
# Marca el progreso con líneas "::step::" que la app parsea para la barra de progreso.

param(
  [Parameter(Mandatory = $true)][string]$DataDir,
  [ValidateSet('cuda', 'cpu', '')]
  [string]$Device = '',
  [string]$UvExe = ''
)

$ErrorActionPreference = 'Stop'
function Step($m) { Write-Host "::step::$m" }
function Fail($m) { Write-Host "::error::$m"; exit 1 }

# --- 1. Dispositivo (GPU NVIDIA → cuda, si no → cpu) ---
if (-not $Device) {
  if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { $Device = 'cuda' } else { $Device = 'cpu' }
}
Step "Hardware detectado: $Device"

# --- 2. Localizar uv (incluido en el instalador; en dev, el del sistema) ---
$uv = ''
if ($UvExe -and (Test-Path $UvExe)) {
  $uv = $UvExe
}
elseif (Get-Command uv -ErrorAction SilentlyContinue) {
  $uv = (Get-Command uv).Source
}
else {
  Fail 'No se encontró uv (gestor de Python). En el instalador final vendrá incluido.'
}

$runtime = Join-Path $DataDir 'runtime'
$venv = Join-Path $runtime 'venv'
$venvPy = Join-Path $venv 'Scripts\python.exe'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null

# --- 3. venv con Python 3.12 (uv lo descarga si falta) ---
if (-not (Test-Path $venvPy)) {
  Step 'Creando entorno de Python 3.12 (uv lo descarga si hace falta)'
  & $uv venv $venv --python 3.12
  if ($LASTEXITCODE -ne 0) { Fail "uv venv falló (código $LASTEXITCODE)" }
}

# --- 4. Dependencias de IA (torch + whisperX; arrastra pyannote, faster-whisper…) ---
if ($Device -eq 'cuda') {
  $index = 'https://download.pytorch.org/whl/cu128'
}
else {
  $index = 'https://download.pytorch.org/whl/cpu'
}
# Instalamos VERSIONES VALIDADAS (lock generado del entorno de desarrollo que
# funciona). Evita el drift de transitivas (torchaudio.AudioMetaData,
# hf_hub_download use_auth_token, etc.). torch/torchaudio van fijados a 2.8.0
# con el índice según el dispositivo; el resto sale del lock.
$lock = Join-Path $PSScriptRoot 'requirements-lock.txt'
Step 'Instalando IA (versiones validadas) — puede tardar y pesar varios GB'
& $uv pip install --python $venvPy torch==2.8.0 torchaudio==2.8.0 -r $lock --extra-index-url $index
if ($LASTEXITCODE -ne 0) { Fail "La instalación de dependencias falló (código $LASTEXITCODE)" }

# --- 5. Verificación ---
Step 'Verificando la instalación'
& $venvPy -c "import torch, whisperx; print('torch', torch.__version__, '| cuda disponible:', torch.cuda.is_available())"
if ($LASTEXITCODE -ne 0) { Fail "La verificación falló (código $LASTEXITCODE)" }

# --- 6. Marcar como listo (la app lee este archivo) ---
Set-Content -Path (Join-Path $runtime '.ready') -Value $Device -Encoding utf8 -NoNewline
Step 'Entorno listo'
