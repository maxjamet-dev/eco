# Grabador de Reuniones (local)

Aplicación de escritorio para **grabar reuniones localmente (solo audio),
transcribirlas en español, identificar participantes (diarización) y generar
resúmenes con IA** — 100% local, sin que ningún dato salga del equipo.

Equivalente privado a tl;dv para Windows. Basado en el [SDD](./SDD_Grabador_Reuniones_Local.md).

## Stack

| Capa | Tecnología |
|---|---|
| App | Electron + React + TypeScript (electron-vite) |
| Persistencia | SQLite + FTS5 (better-sqlite3) |
| Captura de audio | Binario nativo Rust (WASAPI: micrófono + loopback) |
| ASR + diarización | whisperX (faster-whisper + pyannote) sobre CUDA |
| Resúmenes | Ollama (Qwen3 / Gemma 3) — HTTP local |
| Fallback CPU | whisper.cpp |

## Requisitos

- Windows 10/11
- Node.js 20+ y npm
- GPU NVIDIA con CUDA (recomendado; hay fallback CPU)
- Python (gestionado vía `uv`, ver `python/`)
- Rust (para compilar la captura nativa)
- Ollama
- **Visual Studio Build Tools (C++)** — para compilar el binario Rust y
  recompilar better-sqlite3

## Puesta en marcha

```powershell
# 1) Instalar herramientas que requieren admin (UNA vez, como administrador)
.\scripts\setup-windows.ps1

# 2) Dependencias JS
npm install

# 3) Entorno Python (whisperX)
cd python
uv venv --python 3.12 .venv
uv pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cu128
cd ..

# 4) Modelo de resumen
ollama pull qwen3:8b

# 5) Desarrollo
npm run dev
```

## Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | App en modo desarrollo (HMR) |
| `npm run build` | Bundles de producción (main/preload/renderer) |
| `npm test` | Tests unitarios/integración (Vitest) |
| `npm run test:e2e` | E2E con Playwright (Electron) |
| `npm run typecheck` | Typecheck de node + web |
| `npm run lint` | ESLint |
| `npm run package` | Instalador `.exe` (electron-builder) |
| `npm run rebuild` | Recompila better-sqlite3 para Electron |

### Tests del worker Python

```powershell
cd python
.\.venv\Scripts\python.exe -m unittest test_worker -v
.\.venv\Scripts\python.exe -m unittest eval.test_metrics -v
.\.venv\Scripts\python.exe smoke_transcribe.py   # smoke E2E en GPU (modelo tiny)
```

## Privacidad

Por defecto **nada sale del equipo**. El token de Hugging Face y futuras API
keys se guardan cifrados con `safeStorage` del SO. Cumplimiento Ley 21.719 (Chile):
ver §13 del SDD (validar texto legal con un abogado).

## Documentos

- [SDD](./SDD_Grabador_Reuniones_Local.md) — diseño de software (contrato técnico)
- [DECISIONS.md](./DECISIONS.md) — decisiones tomadas durante el desarrollo
- [QUESTIONS_FOR_MAX.md](./QUESTIONS_FOR_MAX.md) — pendientes que requieren tu acción
- [CLAUDE.md](./CLAUDE.md) — mapa del código para asistentes de IA
