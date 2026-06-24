import type { SqlDb } from './driver'
import { RecordingRepository } from './recordingRepository'
import { TranscriptRepository } from './transcriptRepository'
import { SummaryRepository } from './summaryRepository'
import { JobRepository } from './jobRepository'
import { SettingsRepository } from './settingsRepository'

export interface Repositories {
  recordings: RecordingRepository
  transcripts: TranscriptRepository
  summaries: SummaryRepository
  jobs: JobRepository
  settings: SettingsRepository
}

/**
 * Construye el conjunto de repositorios sobre un driver dado (testeable).
 * Este módulo es PURO: no importa better-sqlite3, por lo que los tests pueden
 * usarlo con un driver node:sqlite sin cargar el módulo nativo.
 * El singleton de producción `getRepositories()` vive en ./db.
 */
export function createRepositories(db: SqlDb): Repositories {
  return {
    recordings: new RecordingRepository(db),
    transcripts: new TranscriptRepository(db),
    summaries: new SummaryRepository(db),
    jobs: new JobRepository(db),
    settings: new SettingsRepository(db)
  }
}

export {
  RecordingRepository,
  TranscriptRepository,
  SummaryRepository,
  JobRepository,
  SettingsRepository
}
export { DEFAULT_SETTINGS } from './settingsRepository'
