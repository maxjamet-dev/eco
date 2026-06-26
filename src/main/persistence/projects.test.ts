import { describe, it, expect, beforeEach } from 'vitest'
import { createNodeSqliteDriver } from './nodeSqliteDriver'
import { runMigrations, LATEST_SCHEMA_VERSION } from './migrations'
import { createRepositories, type Repositories } from './index'

function fresh(): Repositories {
  const db = createNodeSqliteDriver(':memory:')
  runMigrations(db)
  return createRepositories(db)
}

describe('ProjectRepository', () => {
  let repos: Repositories
  beforeEach(() => {
    repos = fresh()
  })

  it('crea, lista y cuenta reuniones', () => {
    const p = repos.projects.create({ nombre: 'Cliente X', creadoEn: '2026-06-24T00:00:00Z' })
    expect(p.id).toBeTruthy()
    expect(repos.projects.list()).toHaveLength(1)
    expect(repos.projects.countRecordings(p.id)).toBe(0)

    const rec = repos.recordings.create({
      modo: 'online',
      fechaInicio: '2026-06-24T00:00:00Z',
      projectId: p.id
    })
    expect(repos.projects.countRecordings(p.id)).toBe(1)
    expect(rec.projectId).toBe(p.id)
  })

  it('renombra y actualiza descripción', () => {
    const p = repos.projects.create({ nombre: 'Inicial', creadoEn: '2026-06-24T00:00:00Z' })
    repos.projects.update(p.id, { nombre: 'Renombrado', descripcion: 'contexto' })
    const got = repos.projects.get(p.id)!
    expect(got.nombre).toBe('Renombrado')
    expect(got.descripcion).toBe('contexto')
  })

  it('al borrar un proyecto, las reuniones quedan sin proyecto (no se borran)', () => {
    const p = repos.projects.create({ nombre: 'P', creadoEn: '2026-06-24T00:00:00Z' })
    const rec = repos.recordings.create({
      modo: 'online',
      fechaInicio: '2026-06-24T00:00:00Z',
      projectId: p.id
    })
    repos.projects.delete(p.id)
    expect(repos.projects.get(p.id)).toBeNull()
    const r = repos.recordings.get(rec.id)!
    expect(r).not.toBeNull()
    expect(r.projectId).toBeNull()
  })
})

describe('RecordingRepository — update y filtros', () => {
  let repos: Repositories
  beforeEach(() => {
    repos = fresh()
  })

  it('actualiza título, descripción y proyecto', () => {
    const p = repos.projects.create({ nombre: 'P', creadoEn: '2026-06-24T00:00:00Z' })
    const rec = repos.recordings.create({ modo: 'online', fechaInicio: '2026-06-24T00:00:00Z' })
    repos.recordings.update(rec.id, {
      titulo: 'Reunión semanal',
      descripcion: 'Revisión de avances',
      projectId: p.id
    })
    const r = repos.recordings.get(rec.id)!
    expect(r.titulo).toBe('Reunión semanal')
    expect(r.descripcion).toBe('Revisión de avances')
    expect(r.projectId).toBe(p.id)
  })

  it('crea reunión importada con tipo correcto', () => {
    const rec = repos.recordings.create({
      titulo: 'WhatsApp',
      modo: 'online',
      fechaInicio: '2026-06-24T00:00:00Z',
      tipo: 'importada',
      estado: 'captured'
    })
    expect(rec.tipo).toBe('importada')
    expect(rec.estado).toBe('captured')
  })

  it('filtra por proyecto', () => {
    const p = repos.projects.create({ nombre: 'P', creadoEn: '2026-06-24T00:00:00Z' })
    repos.recordings.create({ titulo: 'A', modo: 'online', fechaInicio: '2026-06-24T01:00:00Z', projectId: p.id })
    repos.recordings.create({ titulo: 'B', modo: 'online', fechaInicio: '2026-06-24T02:00:00Z' })
    expect(repos.recordings.list(undefined, p.id)).toHaveLength(1)
    expect(repos.recordings.list()).toHaveLength(2)
  })

  it('las migraciones se aplican y son idempotentes', () => {
    const db = createNodeSqliteDriver(':memory:')
    expect(runMigrations(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(() => runMigrations(db)).not.toThrow()
  })
})
