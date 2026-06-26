# Decisiones del instalador de eco

Documento vivo con las decisiones tomadas para empaquetar y distribuir **eco**
(antes "Grabador de Reuniones"). Estrategia general: **instalador chico + el
entorno pesado de IA se descarga/arma en el primer arranque**.

## 1. Marca
| Ítem | Decisión |
|---|---|
| Nombre visible | **eco** (minúscula) |
| appId | **app.eco.grabador** |
| Ícono | Símbolo de eco (punto rojo + anillos) sobre **fondo oscuro** redondeado |
| Autor / editor | **Max Jamet** |
| Copyright | © 2026 Max Jamet |
| Acceso directo | **eco** |

## 2. Separación de voces / token Hugging Face
- **Token obligatorio por usuario** (cada quien pone el suyo; función completa siempre).
- **Asistente paso a paso** en el primer arranque: crear cuenta → aceptar licencia de
  pyannote → generar token → pegarlo, con validación en vivo.

## 3. Runtime de Python (motor de transcripción)
- **Python portable incluido** (python-build-standalone) — el usuario no instala Python.
- Entorno + modelos en **`%APPDATA%/eco`** (automático, sobrevive a actualizaciones).
- **Mismo pipeline (whisperX + pyannote) en todos lados; solo cambia el dispositivo:**
  - **NVIDIA** con driver compatible → torch **cu128** (rápido).
  - **Sin NVIDIA** (incl. GPU integrada) → **torch-CPU**, mismo pipeline completo
    **con diarización** (más lento, pero funciona). La GPU integrada no se usa (stack CUDA).
- **No** usamos `whisper.cpp` como fallback: se descartó porque no diariza. Mantener
  whisperX+pyannote en CPU conserva la separación de voces (pyannote 3.1 es el mejor en
  calidad; alternativas tipo sherpa-onnx son más livianas pero no mejores).
- **Auto-ajuste en CPU**: avisar "tu PC no tiene NVIDIA, irá más lento" y usar un modelo
  ASR más liviano por defecto (la diarización se mantiene).
- Nota: torch-CPU pesa ~200-300 MB (más liviano que los ~2.5 GB de torch-CUDA).

## 4. Resúmenes / Ollama
- Los resúmenes son **a petición** (ya implementado).
- eco **detecta y ofrece instalar Ollama** (winget) cuando el usuario pide un resumen.
- Modelo por defecto **qwen3:8b** (cambiable en Ajustes).

## 5. Distribución / sistema
- Instalador **sin firmar** (aviso de SmartScreen una vez; aceptable para uso personal).
- **Auto-update** vía **GitHub Releases** (electron-updater). *Requiere repo en GitHub.*
- Driver NVIDIA demasiado viejo para cu128 → **cae a CPU + sugiere actualizar el driver**.

## 6. Primer arranque
- Asistente **"Preparar eco"** al inicio: token → "Preparar todo" (descarga env/modelos
  con progreso) → listo.
- Proceso **robusto**: chequeo de espacio en disco, detección de falta de internet,
  reintento por paso y **reanudación** de descargas interrumpidas.

---

## Prerequisitos de Max (fuera del código)
1. **Compilar `meetcap.exe`** (binario de captura Rust) — sin él no graba.
   Lo hace `scripts/setup-windows.ps1` (PowerShell como administrador + MSVC).
2. **Crear repo en GitHub** para publicar las versiones (auto-update). Definir `owner/repo`.
3. Cada usuario (Max, primo) necesita **su propio token de Hugging Face** y aceptar la
   licencia de pyannote.

## Roadmap de implementación
- [x] **F0 — Decisiones** (este documento).
- [x] **F1 — Rebrand**: `electron-builder.yml`, `package.json`, título, ícono `.ico`.
- [x] **F2 — Carpeta de datos a `/eco`** con migración desde `grabador-reuniones`.
- [x] **F3 — Gestor de entorno (bootstrap)**: `resources/prepare-eco.ps1` (usa **uv**: crea
      venv 3.12 cu128/CPU + instala whisperX) + `envManager.ts` + IPC + log en vivo.
      **Validado end-to-end** (torch 2.11+cu128, cuda True). `uv.exe` incluido en `resources/`.
      Pipeline conectado al venv de `%APPDATA%/eco` (fallback a `python/.venv` en dev).
      *Pendiente menor*: pre-descarga de modelos y robustez fina (disco/reanudación).
- [x] **F4 — Asistente "Preparar eco"** (`Onboarding.tsx`): bienvenida → token guiado → preparar → listo.
- [x] **F5 — Ollama** (`ollamaManager.ts`): detecta estado + ofrece descargar modelo / link de instalación.
- [x] **F6 — Auto-update** (`updater.ts`): electron-updater + `publish: github` (falta poner el repo real).
- [ ] **F7 — Empaquetar** (en tu máquina): compilar `meetcap.exe`, poner `owner/repo` reales,
      `npm run package` → `eco-0.1.0-setup.exe`, y probar.

## Notas de empaquetado
- `resources/uv.exe` (~69 MB) está incluido. Conviene **gitignorarlo** y bajarlo en un paso de
  build (script) en vez de commitearlo.
- `extraResources` ya copia `resources/` y los `python/*.py` (worker) — sin el `.venv`.
- Falta poner el `owner/repo` real en `electron-builder.yml` (publish) para el auto-update.

> Nota: el arranque `npm run dev` falla en entornos no-interactivos (crash del cargador
> ESM de Electron al importar el módulo CJS `electron`), pero funciona en la máquina de Max.
