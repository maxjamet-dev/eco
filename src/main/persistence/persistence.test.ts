import { describe, it, expect, beforeEach } from 'vitest'
import { createNodeSqliteDriver } from './nodeSqliteDriver'
import { runMigrations, LATEST_SCHEMA_VERSION } from './migrations'
import { createRepositories, type Repositories } from './index'
import { sanitizeFtsQuery } from './transcriptRepository'
import type { SqlDb } from './driver'

function freshDb(): { db: SqlDb; repos: Repositories } {
  const db = createNodeSqliteDriver(':memory:')
  runMigrations(db)
  return { db, repos: createRepositories(db) }
}

describe('migraciones', () => {
  it('aplica el esquema y fija user_version', () => {
    const db = createNodeSqliteDriver(':memory:')
    const v = runMigrations(db)
    expect(v).toBe(LATEST_SCHEMA_VERSION)
    const row = db.prepare('PRAGMA user_version').get<{ user_version: number }>()
    expect(row?.user_version).toBe(LATEST_SCHEMA_VERSION)
  })

  it('es idempotente (no re-aplica)', () => {
    const db = createNodeSqliteDriver(':memory:')
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
  })
})

describe('RecordingRepository', () => {
  let repos: Repositories
  beforeEach(() => {
    repos = freshDb().repos
  })

  it('crea y recupera una grabación', () => {
    const rec = repos.recordings.create({
      titulo: 'Daily',
      modo: 'online',
      fechaInicio: '2026-06-24T10:00:00.000Z'
    })
    expect(rec.id).toBeTruthy()
    expect(rec.estado).toBe('recording')
    const fetched = repos.recordings.get(rec.id)
    expect(fetched?.titulo).toBe('Daily')
  })

  it('lista por fecha desc y filtra por título', () => {
    repos.recordings.create({ titulo: 'Alfa', modo: 'online', fechaInicio: '2026-06-01T00:00:00Z' })
    repos.recordings.create({ titulo: 'Beta', modo: 'online', fechaInicio: '2026-06-02T00:00:00Z' })
    const all = repos.recordings.list()
    expect(all.map((r) => r.titulo)).toEqual(['Beta', 'Alfa'])
    expect(repos.recordings.list('alf').map((r) => r.titulo)).toEqual(['Alfa'])
  })

  it('actualiza estado, audio, duración y backend', () => {
    const rec = repos.recordings.create({ modo: 'online', fechaInicio: '2026-06-24T00:00:00Z' })
    repos.recordings.setStatus(rec.id, 'queued')
    repos.recordings.setAudioPaths(rec.id, 'mic.wav', 'sys.wav', 120)
    repos.recordings.setDuration(rec.id, 5000)
    repos.recordings.setBackend(rec.id, 'cuda')
    const r = repos.recordings.get(rec.id)!
    expect(r.estado).toBe('queued')
    expect(r.rutaAudioMic).toBe('mic.wav')
    expect(r.offsetSysMs).toBe(120)
    expect(r.duracionMs).toBe(5000)
    expect(r.backendUsado).toBe('cuda')
  })

  it('borra en cascada (segmentos, speakers, jobs, summary)', () => {
    const rec = repos.recordings.create({ modo: 'online', fechaInicio: '2026-06-24T00:00:00Z' })
    const sp = repos.recordings.upsertSpeaker({ recordingId: rec.id, etiqueta: 'MIC', origen: 'mic' })
    repos.transcripts.insertSegments(
      rec.id,
      [{ inicioMs: 0, finMs: 100, etiqueta: 'MIC', texto: 'hola' }],
      new Map([['MIC', sp.id]])
    )
    repos.jobs.enqueue(rec.id, 'transcribe', '2026-06-24T00:00:00Z')
    repos.recordings.delete(rec.id)
    expect(repos.recordings.get(rec.id)).toBeNull()
    expect(repos.transcripts.listByRecording(rec.id)).toHaveLength(0)
    expect(repos.recordings.listSpeakers(rec.id)).toHaveLength(0)
    expect(repos.jobs.listByRecording(rec.id)).toHaveLength(0)
  })

  it('upsertSpeaker es idempotente por etiqueta y permite renombrar', () => {
    const rec = repos.recordings.create({ modo: 'online', fechaInicio: '2026-06-24T00:00:00Z' })
    const a = repos.recordings.upsertSpeaker({ recordingId: rec.id, etiqueta: 'SPEAKER_00', origen: 'diar' })
    const b = repos.recordings.upsertSpeaker({ recordingId: rec.id, etiqueta: 'SPEAKER_00', origen: 'diar' })
    expect(a.id).toBe(b.id)
    repos.recordings.renameSpeaker(rec.id, a.id, 'María')
    expect(repos.recordings.listSpeakers(rec.id)[0].nombre).toBe('María')
  })
})

describe('TranscriptRepository + FTS5', () => {
  let repos: Repositories
  beforeEach(() => {
    repos = freshDb().repos
  })

  function seed(): string {
    const rec = repos.recordings.create({ modo: 'online', fechaInicio: '2026-06-24T00:00:00Z' })
    const mic = repos.recordings.upsertSpeaker({ recordingId: rec.id, etiqueta: 'MIC', origen: 'mic' })
    const s0 = repos.recordings.upsertSpeaker({ recordingId: rec.id, etiqueta: 'SPEAKER_00', origen: 'diar' })
    repos.transcripts.insertSegments(
      rec.id,
      [
        { inicioMs: 0, finMs: 1000, etiqueta: 'MIC', texto: 'Hola equipo, partamos la reunión' },
        { inicioMs: 1000, finMs: 2000, etiqueta: 'SPEAKER_00', texto: 'Revisemos el presupuesto anual' }
      ],
      new Map([
        ['MIC', mic.id],
        ['SPEAKER_00', s0.id]
      ])
    )
    return rec.id
  }

  it('mapea etiquetas a nombres legibles (Yo / Participante N)', () => {
    const id = seed()
    const segs = repos.transcripts.listByRecording(id)
    expect(segs[0].speaker).toBe('Yo')
    expect(segs[1].speaker).toBe('Participante 1')
  })

  it('busca por FTS con prefijo e ignora diacríticos', () => {
    const id = seed()
    expect(repos.transcripts.search(id, 'presupuesto')).toHaveLength(1)
    expect(repos.transcripts.search(id, 'reunion')).toHaveLength(1) // sin tilde
    expect(repos.transcripts.search(id, 'presu')).toHaveLength(1) // prefijo
    expect(repos.transcripts.search(id, 'inexistente')).toHaveLength(0)
  })

  it('mantiene FTS sincronizado tras búsqueda global', () => {
    seed()
    const r = repos.transcripts.searchGlobal('presupuesto')
    expect(r).toHaveLength(1)
    expect(r[0].segment.texto).toContain('presupuesto')
  })

  it('sanitizeFtsQuery escapa y arma prefijos', () => {
    expect(sanitizeFtsQuery('  hola  mundo ')).toBe('"hola"* "mundo"*')
    expect(sanitizeFtsQuery('a"b*c')).toBe('"abc"*')
    expect(sanitizeFtsQuery('   ')).toBeNull()
  })
})

describe('SummaryRepository', () => {
  it('guarda y recupera resumen con puntos y action items', () => {
    const { repos } = freshDb()
    const rec = repos.recordings.create({ modo: 'online', fechaInicio: '2026-06-24T00:00:00Z' })
    repos.summaries.upsert(rec.id, {
      resumen: 'Reunión sobre presupuesto',
      puntosClave: ['Punto 1', 'Punto 2'],
      actionItems: [{ descripcion: 'Enviar informe', responsable: 'Max' }],
      modeloUsado: 'qwen3:8b'
    })
    const s = repos.summaries.get(rec.id)!
    expect(s.resumen).toBe('Reunión sobre presupuesto')
    expect(s.puntosClave).toEqual(['Punto 1', 'Punto 2'])
    expect(s.actionItems[0].responsable).toBe('Max')
    expect(s.modeloUsado).toBe('qwen3:8b')
  })

  it('upsert reemplaza action items previos', () => {
    const { repos } = freshDb()
    const rec = repos.recordings.create({ modo: 'online', fechaInicio: '2026-06-24T00:00:00Z' })
    repos.summaries.upsert(rec.id, {
      resumen: 'v1',
      puntosClave: [],
      actionItems: [{ descripcion: 'A' }, { descripcion: 'B' }],
      modeloUsado: 'm'
    })
    repos.summaries.upsert(rec.id, {
      resumen: 'v2',
      puntosClave: [],
      actionItems: [{ descripcion: 'C' }],
      modeloUsado: 'm'
    })
    const s = repos.summaries.get(rec.id)!
    expect(s.resumen).toBe('v2')
    expect(s.actionItems).toHaveLength(1)
    expect(s.actionItems[0].descripcion).toBe('C')
  })
})

describe('JobRepository (cola)', () => {
  let repos: Repositories
  let recId: string
  beforeEach(() => {
    repos = freshDb().repos
    recId = repos.recordings.create({ modo: 'online', fechaInicio: '2026-06-24T00:00:00Z' }).id
  })

  it('encola y entrega en orden FIFO', () => {
    repos.jobs.enqueue(recId, 'transcribe', '2026-06-24T00:00:00Z')
    repos.jobs.enqueue(recId, 'summarize', '2026-06-24T00:00:01Z')
    const next = repos.jobs.nextPending()!
    expect(next.etapa).toBe('transcribe')
  })

  it('marca running/done y cuenta intentos', () => {
    const job = repos.jobs.enqueue(recId, 'transcribe', '2026-06-24T00:00:00Z')
    repos.jobs.markRunning(job.id)
    expect(repos.jobs.get(job.id)!.intentos).toBe(1)
    repos.jobs.markDone(job.id)
    expect(repos.jobs.get(job.id)!.estado).toBe('done')
    expect(repos.jobs.nextPending()).toBeNull()
  })

  it('falla y reencola para reintento', () => {
    const job = repos.jobs.enqueue(recId, 'transcribe', '2026-06-24T00:00:00Z')
    repos.jobs.markFailed(job.id, 'boom')
    expect(repos.jobs.get(job.id)!.estado).toBe('failed')
    expect(repos.jobs.get(job.id)!.error).toBe('boom')
    repos.jobs.requeue(job.id)
    expect(repos.jobs.nextPending()!.id).toBe(job.id)
  })

  it('reencola trabajos running tras reinicio', () => {
    const job = repos.jobs.enqueue(recId, 'transcribe', '2026-06-24T00:00:00Z')
    repos.jobs.markRunning(job.id)
    const reset = repos.jobs.resetRunningToPending()
    expect(reset).toBe(1)
    expect(repos.jobs.nextPending()!.id).toBe(job.id)
  })
})

describe('SettingsRepository', () => {
  it('devuelve defaults y mezcla parches', () => {
    const { repos } = freshDb()
    const def = repos.settings.getAll()
    expect(def.modeloAsr).toBe('large-v3-turbo')
    expect(def.backend).toBe('auto')
    const updated = repos.settings.set({ modeloLlm: 'gemma3:12b', backend: 'cuda' })
    expect(updated.modeloLlm).toBe('gemma3:12b')
    expect(updated.backend).toBe('cuda')
    // persistencia
    expect(repos.settings.getAll().modeloLlm).toBe('gemma3:12b')
  })
})
