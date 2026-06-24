import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Orchestrator, type OrchestratorDeps } from './orchestrator'
import { createNodeSqliteDriver } from './persistence/nodeSqliteDriver'
import { runMigrations } from './persistence/migrations'
import { createRepositories, DEFAULT_SETTINGS, type Repositories } from './persistence'
import type {
  AudioTrackRef,
  CombinedAsrDiarizationProvider,
  SummarizationProvider,
  TranscribeOptions,
  DiarizeOptions
} from '@shared/providers'
import type { MeetingSummary, ProcessingProgress, TranscriptSegment } from '@shared/types'

/** Proveedor combinado fake: ASR + diarización en una pasada. */
class FakeWhisperX implements CombinedAsrDiarizationProvider {
  readonly name = 'fake-whisperx'
  transcribeCalls: string[] = []
  diarizeCalls: string[] = []

  async transcribe(track: AudioTrackRef, _opts: TranscribeOptions): Promise<TranscriptSegment[]> {
    this.transcribeCalls.push(track.label)
    // El micrófono ("Yo") produce un segmento sin diarización.
    return [{ inicioMs: 0, finMs: 1000, speaker: 'Yo', texto: `mic:${track.label}` }]
  }

  async transcribeAndDiarize(
    track: AudioTrackRef,
    _opts: TranscribeOptions & DiarizeOptions
  ): Promise<TranscriptSegment[]> {
    this.diarizeCalls.push(track.label)
    return [
      { inicioMs: 1200, finMs: 2000, speaker: 'SPEAKER_00', texto: 'hola participante' },
      { inicioMs: 2100, finMs: 3000, speaker: 'SPEAKER_01', texto: 'otra persona' }
    ]
  }
}

class FakeSummarizer implements SummarizationProvider {
  readonly name = 'fake-ollama'
  calls = 0
  shouldFail = false
  async summarize(transcript: TranscriptSegment[], _opts: { model: string }): Promise<MeetingSummary> {
    this.calls++
    if (this.shouldFail) throw new Error('LLM caído')
    return {
      resumen: `resumen de ${transcript.length} segmentos`,
      puntosClave: ['p1'],
      actionItems: [{ descripcion: 'hacer algo', responsable: 'Yo' }],
      modeloUsado: 'fake'
    }
  }
}

function setup(overrides: Partial<OrchestratorDeps> = {}) {
  const db = createNodeSqliteDriver(':memory:')
  runMigrations(db)
  const repos: Repositories = createRepositories(db)
  const whisperx = new FakeWhisperX()
  const summarizer = new FakeSummarizer()
  const progress: ProcessingProgress[] = []
  const deps: OrchestratorDeps = {
    repos,
    selectProviders: async () => ({ device: 'cuda', transcription: whisperx }),
    summarization: summarizer,
    getSettings: () => ({ ...DEFAULT_SETTINGS }),
    getHfToken: () => 'hf_fake',
    emitProgress: (p) => progress.push(p),
    now: () => '2026-06-24T00:00:00.000Z',
    ...overrides
  }
  const orch = new Orchestrator(deps)
  return { orch, repos, whisperx, summarizer, progress }
}

function captured(repos: Repositories, modo: 'online' | 'presencial' = 'online') {
  const rec = repos.recordings.create({ titulo: 'T', modo, fechaInicio: '2026-06-24T00:00:00Z' })
  repos.recordings.setAudioPaths(rec.id, 'mic.wav', modo === 'online' ? 'sys.wav' : null, 0)
  repos.recordings.setStatus(rec.id, 'captured')
  return rec.id
}

describe('Orchestrator — pipeline online', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
  })

  it('procesa de queued a completed con transcripción, fusión y resumen', async () => {
    const id = captured(ctx.repos)
    ctx.orch.enqueue(id)
    // drain es async; esperamos a que termine.
    await vi.waitFor(() => {
      expect(ctx.repos.recordings.get(id)!.estado).toBe('completed')
    })

    // Micrófono transcrito, sistema diarizado.
    expect(ctx.whisperx.transcribeCalls).toContain('mic')
    expect(ctx.whisperx.diarizeCalls).toContain('system')

    const detail = ctx.repos.transcripts.listByRecording(id)
    expect(detail.length).toBe(3) // 1 mic + 2 sistema
    // El primero es el del micrófono (t=0) → "Yo"
    expect(detail[0].speaker).toBe('Yo')

    const summary = ctx.repos.summaries.get(id)!
    expect(summary.resumen).toContain('3 segmentos')
    expect(ctx.repos.recordings.get(id)!.backendUsado).toBe('cuda')
  })

  it('emite progreso por cada etapa', async () => {
    const id = captured(ctx.repos)
    ctx.orch.enqueue(id)
    await vi.waitFor(() => expect(ctx.repos.recordings.get(id)!.estado).toBe('completed'))
    const estados = ctx.progress.map((p) => p.estado)
    expect(estados).toEqual(
      expect.arrayContaining(['queued', 'processing', 'merging', 'summarizing', 'completed'])
    )
  })
})

describe('Orchestrator — modo presencial', () => {
  it('diariza el micrófono e ignora la pista del sistema', async () => {
    const ctx = setup()
    const id = captured(ctx.repos, 'presencial')
    ctx.orch.enqueue(id)
    await vi.waitFor(() => expect(ctx.repos.recordings.get(id)!.estado).toBe('completed'))
    // En presencial usamos transcribeAndDiarize sobre el micrófono.
    expect(ctx.whisperx.diarizeCalls).toContain('mic')
    expect(ctx.whisperx.diarizeCalls).not.toContain('system')
  })
})

describe('Orchestrator — fallo y reintento', () => {
  it('marca failed cuando el resumen falla y reintenta a completed', async () => {
    const ctx = setup()
    ctx.summarizer.shouldFail = true
    const id = captured(ctx.repos)
    ctx.orch.enqueue(id)
    await vi.waitFor(() => expect(ctx.repos.recordings.get(id)!.estado).toBe('failed'))

    const jobs = ctx.repos.jobs.listByRecording(id)
    expect(jobs.some((j) => j.estado === 'failed' && j.error?.includes('LLM'))).toBe(true)

    // Reintento exitoso.
    ctx.summarizer.shouldFail = false
    ctx.orch.retry(id)
    await vi.waitFor(() => expect(ctx.repos.recordings.get(id)!.estado).toBe('completed'))
    // No se duplican segmentos (limpieza idempotente).
    expect(ctx.repos.transcripts.listByRecording(id).length).toBe(3)
  })
})

describe('Orchestrator — reanudación', () => {
  it('reencola grabaciones no terminales tras reinicio', async () => {
    const ctx = setup()
    const id = captured(ctx.repos)
    // Simulamos un crash dejando la grabación en "processing".
    ctx.repos.recordings.setStatus(id, 'processing')
    await ctx.orch.resumePending()
    await vi.waitFor(() => expect(ctx.repos.recordings.get(id)!.estado).toBe('completed'))
  })
})
