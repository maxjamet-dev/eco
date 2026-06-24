# Decisiones tomadas durante la sesión autónoma

> Registro de decisiones técnicas que tomé sin consultar (el usuario me autorizó a decidir todo).
> Las decisiones que **requieren** validación humana están en `QUESTIONS_FOR_MAX.md`.

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| D-1 | **electron-vite + electron-builder** | Electron Forge, webpack manual | Acordado con el usuario; HMR rápido, TS estricto, build de .exe simple |
| D-2 | **npm** como gestor de paquetes | pnpm/yarn | Ya instalado (npm 11); evita introducir otra herramienta |
| D-3 | **React 18 + TypeScript estricto** | React 19 | 18 es el más estable con el ecosistema Electron/Vite a la fecha |
| D-4 | **Zustand** para estado de UI | Redux, Context puro | Mínimo boilerplate, ideal para estado de grabación en vivo |
| D-5 | **CSS plano con tokens** (sin Tailwind) | Tailwind, CSS-in-JS | Evita fricción de build con electron-vite; control total del diseño |
| D-6 | **better-sqlite3** + `@electron/rebuild` | node:sqlite (experimental) | Es la elección del SDD, síncrono (ideal en main), FTS5 sólido |
| D-7 | **Worker Python persistente por socket TCP local** | Invocación por proceso/trabajo | Evita recargar modelos (~10-30s) en cada grabación; el SDD lo permite |
| D-8 | **Rust: crate `wasapi`** para captura | cpal | Control fino sobre mic + loopback con reloj común (QPC), requisito del SDD |
| D-9 | **Modelo ASR por defecto: `large-v3-turbo`** | `large-v3` | 8 GB VRAM: turbo deja espacio para el LLM y es casi tan preciso |
| D-10 | **LLM por defecto: `qwen3:8b` (Q4)** | Qwen3 14B/32B | No caben 14B+ASR en 8 GB; 8B Q4 (~5 GB) sí, con carga secuencial |
| D-11 | **Gestión de VRAM secuencial** | Co-residencia ASR+LLM | 8 GB no permite ambos a la vez; orquestador libera ASR antes del LLM |
| D-12 | **Protocolo sidecar Rust: JSON por líneas (stdin/stdout)** | gRPC, named pipes | Simple, depurable, multiplataforma, suficiente para control start/stop |
| D-13 | **Vitest** para unit/integración, **Playwright** para E2E | Jest | Coincide con el SDD; Vitest integra nativo con Vite |
| D-14 | **Migraciones SQL versionadas en código** (no ORM) | Prisma, Drizzle | Control total del esquema + FTS5 + triggers; better-sqlite3 es directo |
