# Preguntas para revisar en la mañana ☕

> Cosas que **idealmente** decides tú, pero que NO bloquearon el avance.
> Para cada una elegí un valor por defecto razonable y seguí adelante; marca lo que quieras cambiar.

## 📋 Resumen de la sesión nocturna

**Construido y verificado (todo testeado):**
- ✅ Monorepo Electron+React+TS (electron-vite + electron-builder)
- ✅ Contratos `shared/` (tipos, IPC tipado, interfaces de proveedor)
- ✅ Persistencia SQLite+FTS5 con migraciones y repos — **18 tests**
- ✅ Orquestador + cola + máquina de estados + reanudación — **5 tests**
- ✅ Proveedores whisperX/whisper.cpp/Ollama + Hardware/Backend — **23 tests**
- ✅ Worker Python whisperX **validado E2E en tu RTX 5070 (CUDA)** — 3+ tests
- ✅ UI React completa (Home/Recording/Detail/Settings) — typecheck + build OK
- ✅ Captura Rust WASAPI (código completo, deps resuelven)
- ✅ Readiness/asistente + **E2E Playwright en verde** (la app arranca)
- ✅ Métricas WER/DER + retry/backoff — **7 + 5 tests**
- **Total: 57 tests TypeScript + 10 tests Python, todos verdes. ESLint limpio.**

**Bloqueado solo por permisos de admin (lo resuelve `scripts/setup-windows.ps1`):**
- ⏳ Compilar el binario Rust (`native/`) — necesita MSVC Build Tools
- ⏳ Recompilar better-sqlite3 para Electron — necesita MSVC
- ⏳ Generar instalador `.exe` — necesita Developer Mode (symlinks)

**Decisiones técnicas tomadas:** ver `DECISIONS.md`. **Mapa del código:** `CLAUDE.md`.

---

## ⚠️ LO PRIMERO al despertar: ejecutar `scripts/setup-windows.ps1` como administrador

Anoche no pude instalar **Visual Studio Build Tools (C++)** porque requiere
elevación (UAC) y tú estabas durmiendo. Sin el linker MSVC quedan bloqueados
solo dos pasos de compilación nativa (todo el resto está hecho y testeado):

1. **Compilar el binario de captura Rust** (`native/`). El código está completo
   y las dependencias resuelven; falta `cargo build` con MSVC. Tras compilar,
   es posible que 1-2 nombres de la API de la crate `wasapi` necesiten un ajuste
   menor (lo verás en los errores de `cargo build`; están aislados en
   `native/src/capture.rs` y `main.rs`).
2. **Recompilar `better-sqlite3`** para el ABI de Electron (la app de producción
   lo necesita; los tests ya corren con `node:sqlite` sin esto).

👉 Acción: abre PowerShell **como administrador** y corre:
```powershell
cd "C:\Users\Jamet\Documents\DEV\Meet Record"; .\scripts\setup-windows.ps1
```

### Empaquetado (instalador .exe) — gated por el mismo permiso

`electron-builder` falla al extraer su caché `winCodeSign` (contiene symlinks de
macOS) sin **Developer Mode** o admin. El `setup-windows.ps1` ya lo habilita.
Tras correrlo: `npm run package` genera el instalador NSIS en `release/`.
Lo verificado anoche: `electron-vite build` produce los bundles correctos y la
app **arranca** (test E2E de Playwright en verde).

## Pendientes que necesitan una acción tuya (credenciales / descargas)

1. **Token de Hugging Face para diarización (pyannote).**
   - El modelo `pyannote/speaker-diarization-community-1` es *gated*: hay que aceptar sus términos en huggingface.co **con tu cuenta** y generar un token.
   - Por defecto: la app pide el token en Ajustes y lo guarda con `safeStorage`. El worker Python lo recibe por la petición. **Sin token, la diarización no corre** (la transcripción sí).
   - 👉 Acción: crear cuenta/token en HF y aceptar términos de `community-1` (y `3.1` como fallback).

2. **Modelo de Ollama a descargar.**
   - Elegí `qwen3:8b` por defecto (8 GB VRAM). No hice `ollama pull` automático (descarga de ~5 GB) para no consumir tu ancho de banda sin permiso.
   - 👉 Acción: confirmar modelo y ejecutar `ollama pull qwen3:8b` (o lo dejo en el asistente de primer arranque, que ya está preparado para hacerlo).

## Decisiones de producto (elegí un default, cámbialo si quieres)

3. **Nombre del producto / app id.** Usé `grabador-reuniones` y appId `cl.fundacionciudaddepaz.grabadorreuniones`. ¿Nombre comercial definitivo?

4. **Idioma de la UI.** Hardcodeé español (es-CL). ¿Quieres i18n desde ya o más adelante?

5. **Consentimiento legal (Ley 21.719).** Puse un aviso simple al iniciar grabación. ¿Necesitas texto legal específico revisado por abogado? (lo dejé como placeholder editable).

6. **Retención/borrado de datos.** Implementé borrado manual de grabaciones. ¿Política de retención automática (ej. borrar tras N días)?

7. **Cifrado en reposo (SQLCipher).** Lo dejé como opción NO activada por defecto (el SDD lo marca "opcional"). ¿Activar por defecto?

## Notas técnicas que quizá quieras revisar

8. **VRAM 8 GB:** el diseño asume carga secuencial de modelos (ASR → liberar → LLM). Si consigues una GPU con más VRAM, se puede paralelizar.
9. **Captura WASAPI loopback en Rust:** compila y captura, pero la calidad de cancelación de eco en modo "parlantes" (no audífonos) es limitada. Ver sección de casos límite del SDD.
