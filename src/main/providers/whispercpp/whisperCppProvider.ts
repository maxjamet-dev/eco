import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import type {
  AudioTrackRef,
  TranscribeOptions,
  TranscriptionProvider
} from '@shared/providers'
import type { TranscriptSegment } from '@shared/types'
import { createLogger } from '../../logger'

const log = createLogger('whispercpp')

/** Formato del JSON emitido por whisper.cpp (`-oj`). */
interface WhisperCppJson {
  transcription?: Array<{
    offsets?: { from: number; to: number } // milisegundos
    timestamps?: { from: string; to: string }
    text: string
  }>
}

/**
 * Parser puro del JSON de whisper.cpp. Los offsets vienen en ms.
 * Como es fallback CPU sin diarización, todos los segmentos quedan como
 * un único hablante genérico (SPEAKER_00); el merger los tratará como "los demás".
 */
export function parseWhisperCppJson(raw: unknown): TranscriptSegment[] {
  const data = raw as WhisperCppJson
  if (!data || !Array.isArray(data.transcription)) {
    throw new Error('JSON de whisper.cpp inválido (falta transcription[])')
  }
  return data.transcription
    .filter((t) => typeof t.text === 'string' && t.text.trim().length > 0)
    .map((t) => ({
      inicioMs: t.offsets?.from ?? 0,
      finMs: t.offsets?.to ?? t.offsets?.from ?? 0,
      speaker: 'SPEAKER_00',
      texto: t.text.trim()
    }))
}

/** Ejecuta un comando y devuelve stdout (inyectable para tests). */
export type CommandRunner = (
  bin: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>

const defaultRunner: CommandRunner = (bin, args) =>
  new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    })
  })

/**
 * Proveedor de respaldo en CPU (SDD §6.1, §9.3). Solo transcribe (sin
 * diarización fina). Reutiliza el binario whisper.cpp existente.
 */
export class WhisperCppProvider implements TranscriptionProvider {
  readonly name = 'whisper.cpp'

  constructor(
    private readonly opts: {
      binPath: string
      modelPath: string
      runner?: CommandRunner
      readJson?: (path: string) => Promise<string>
    }
  ) {}

  async transcribe(track: AudioTrackRef, opts: TranscribeOptions): Promise<TranscriptSegment[]> {
    const runner = this.opts.runner ?? defaultRunner
    const outPrefix = track.path.replace(/\.wav$/i, '') + '.cpp'
    const args = [
      '-m',
      this.opts.modelPath,
      '-l',
      opts.lang,
      '-f',
      track.path,
      '-oj',
      '-of',
      outPrefix
    ]
    log.info('Ejecutando whisper.cpp', { bin: this.opts.binPath, model: this.opts.modelPath })
    await runner(this.opts.binPath, args)
    const reader = this.opts.readJson ?? ((p: string) => readFile(p, 'utf8'))
    const jsonText = await reader(outPrefix + '.json')
    return parseWhisperCppJson(JSON.parse(jsonText))
  }
}
