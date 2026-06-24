# CLAUDE.md — Guía del código para asistentes de IA

Mapa del repositorio del **Grabador de Reuniones local**. Lee también el
[SDD](./SDD_Grabador_Reuniones_Local.md) (contrato de diseño) y
[DECISIONS.md](./DECISIONS.md).

## Arquitectura en una frase

Electron (main Node.js + renderer React) orquesta **sidecars de IA**: un binario
Rust para capturar audio (WASAPI), un worker Python (whisperX) para ASR+diarización
y Ollama para resúmenes. Persistencia local en SQLite+FTS5.

## Mapa de directorios

```
src/
  shared/         Contratos compartidos (NO importar Electron/Node aquí)
    types.ts        Tipos de dominio (Recording, TranscriptSegment, AppSettings…)
    ipc.ts          Canales IPC tipados (IpcRequestMap / IpcEventMap)
    providers.ts    Interfaces de proveedor (Transcription/Diarization/Summarization)
  main/           Proceso principal (Node)
    index.ts        Ciclo de vida, ventana, protocolo recmedia:// (audio local)
    bootstrap.ts    Cableado en orden: DB → servicios → IPC → reanudar cola
    services.ts     DI manual: ensambla proveedores + orquestador (producción)
    orchestrator.ts Máquina de estados + cola (queued→…→completed); inyecta deps
    persistence/    SQLite: driver abstracto, migraciones, repos (uno por agregado)
    providers/      whisperx/ (worker TCP), whispercpp/ (CPU), ollama/ (HTTP)
    processing/     trackMerger.ts (fusiona pista mic + sistema por tiempo)
    hardware/       detect.ts (nvidia-smi), backendSelector.ts (cuda|cpu)
    capture/        captureController.ts (binding stdio al binario Rust)
    lib/            retry.ts (backoff)
    secrets.ts      safeStorage (token HF)
    firstRun.ts     Chequeo de readiness (asistente)
  preload/        contextBridge → window.api (canales validados)
  renderer/       React: views/ (Home, Recording, Detail, Settings), store.ts (Zustand)
native/           Rust: meetcap (captura WASAPI mic+loopback, reloj común QPC)
python/           Worker whisperX + compat/audio_io + eval/ (WER/DER)
e2e/              Playwright (lanza Electron)
```

## Patrón clave: testabilidad sin dependencias nativas

- **DB**: `SqlDb` (driver.ts) abstrae SQLite. Producción usa `betterSqliteDriver`
  (módulo nativo, requiere Electron ABI); los **tests** usan `nodeSqliteDriver`
  (`node:sqlite`, integrado en Node 24). Por eso `persistence/index.ts` es PURO
  (no importa better-sqlite3) y el singleton de producción vive en `db.ts`.
- **Proveedores**: cada uno tiene parsers puros (testeados) + I/O fina con
  transporte inyectable (TCP/HTTP/exec). Los tests inyectan fakes.
- **Orquestador**: recibe todas las dependencias por constructor
  (`OrchestratorDeps`), se testea con proveedores fake en memoria.

→ `npm test` corre 100% en Node sin compilar nada nativo.

## Flujo de una grabación

1. `recording:start` → crea Recording, `NativeCaptureController` lanza el binario Rust.
2. `recording:stop` → el binario vuelca mic.wav/system.wav/meta.json (offset por QPC),
   estado=`captured`, se encola.
3. Orquestador: `selectProviders()` (hardware→backend) → transcribe mic + transcribe
   y diariza sistema (whisperX) → `mergeTracks` (offset + intercalado) → persiste
   segmentos+speakers → resume (Ollama) → `completed`. Progreso vía evento IPC.

## Convenciones

- TypeScript estricto. Comentarios y UI en español (es-CL).
- Sin dependencias de Electron en la lógica de negocio (facilita tests).
- Migraciones SQL versionadas en `persistence/migrations.ts` (PRAGMA user_version).
- IPC siempre tipado vía `IpcRequestMap`/`IpcEventMap`; canales validados en preload.

## Estado de compilación (ver QUESTIONS_FOR_MAX.md)

- TS/JS: typecheck + 57 tests Vitest verdes; build electron-vite OK; E2E verde.
- Python: worker validado E2E en CUDA; 10 tests (protocolo + WER/DER).
- **Pendiente de MSVC** (admin): compilar `native/` (Rust) y recompilar
  better-sqlite3; empaquetar instalador (necesita Developer Mode).
  Todo eso lo automatiza `scripts/setup-windows.ps1`.

## Comandos rápidos

```
npm test                      # Vitest (Node, sin nativo)
npm run typecheck             # node + web
npm run build && npm run test:e2e
cd python && .\.venv\Scripts\python.exe -m unittest test_worker eval.test_metrics
```
