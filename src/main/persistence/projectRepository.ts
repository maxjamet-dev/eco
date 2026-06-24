import { randomUUID } from 'node:crypto'
import type { SqlDb } from './driver'
import type { Project } from '@shared/types'

interface ProjectRow {
  id: string
  nombre: string
  descripcion: string | null
  creado_en: string
}

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    creadoEn: r.creado_en
  }
}

/** Repositorio de proyectos (agrupan reuniones). */
export class ProjectRepository {
  constructor(private readonly db: SqlDb) {}

  create(input: { nombre: string; descripcion?: string | null; creadoEn: string }): Project {
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO projects (id, nombre, descripcion, creado_en) VALUES (?, ?, ?, ?)')
      .run(id, input.nombre, input.descripcion ?? null, input.creadoEn)
    return this.get(id)!
  }

  get(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get<ProjectRow>(id)
    return row ? toProject(row) : null
  }

  list(): Project[] {
    return this.db
      .prepare('SELECT * FROM projects ORDER BY nombre COLLATE NOCASE ASC')
      .all<ProjectRow>()
      .map(toProject)
  }

  update(id: string, patch: { nombre?: string; descripcion?: string | null }): void {
    if (patch.nombre !== undefined) {
      this.db.prepare('UPDATE projects SET nombre = ? WHERE id = ?').run(patch.nombre, id)
    }
    if (patch.descripcion !== undefined) {
      this.db.prepare('UPDATE projects SET descripcion = ? WHERE id = ?').run(patch.descripcion, id)
    }
  }

  delete(id: string): void {
    // recordings.project_id queda en NULL por ON DELETE SET NULL (no borra reuniones).
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  /** Cuenta de reuniones por proyecto (para la UI). */
  countRecordings(id: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM recordings WHERE project_id = ?')
      .get<{ c: number }>(id)
    return row?.c ?? 0
  }
}
