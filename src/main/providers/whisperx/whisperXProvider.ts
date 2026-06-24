import { randomUUID } from 'node:crypto'
import type {
  AudioTrackRef,
  CombinedAsrDiarizationProvider,
  DiarizeOptions,
  TranscribeOptions
} from '@shared/providers'
import type { TranscriptSegment } from '@shared/types'
import { parseWhisperXResponse, type WhisperXRequest } from './protocol'

/** Transporte hacia el worker whisperX (TCP en producción, fake en tests). */
export interface WhisperXTransport {
  send(req: WhisperXRequest): Promise<unknown>
}

/**
 * Proveedor primario (CUDA): ASR + alineación + diarización en una pasada
 * (SDD §6.1, §9.3). Habla con el worker Python por un transporte inyectable.
 */
export class WhisperXProvider implements CombinedAsrDiarizationProvider {
  readonly name = 'whisperx'

  constructor(
    private readonly transport: WhisperXTransport,
    private readonly idGen: () => string = randomUUID
  ) {}

  async transcribe(track: AudioTrackRef, opts: TranscribeOptions): Promise<TranscriptSegment[]> {
    const raw = await this.transport.send({
      id: this.idGen(),
      audioPath: track.path,
      lang: opts.lang,
      model: opts.model,
      device: opts.device,
      diarize: false
    })
    return parseWhisperXResponse(raw)
  }

  async transcribeAndDiarize(
    track: AudioTrackRef,
    opts: TranscribeOptions & DiarizeOptions
  ): Promise<TranscriptSegment[]> {
    const raw = await this.transport.send({
      id: this.idGen(),
      audioPath: track.path,
      lang: opts.lang,
      model: opts.model,
      device: opts.device,
      diarize: true,
      minSpeakers: opts.minSpeakers,
      maxSpeakers: opts.maxSpeakers,
      hfToken: opts.hfToken
    })
    return parseWhisperXResponse(raw)
  }
}
