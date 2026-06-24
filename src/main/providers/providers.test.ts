import { describe, it, expect } from 'vitest'
import { parseWhisperXResponse, parseWhisperXDiarization } from './whisperx/protocol'
import { WhisperXProvider, type WhisperXTransport } from './whisperx/whisperXProvider'
import { parseWhisperCppJson } from './whispercpp/whisperCppProvider'
import {
  parseSummaryResponse,
  formatTranscript,
  chunkText,
  OllamaProvider,
  type OllamaTransport,
  type ChatMessage
} from './ollama/ollamaProvider'
import type { WhisperXRequest } from './whisperx/protocol'
import type { TranscriptSegment } from '@shared/types'

describe('whisperX protocol', () => {
  it('convierte segundos a ms y normaliza hablante', () => {
    const segs = parseWhisperXResponse({
      ok: true,
      segments: [
        { start: 1.2, end: 2.5, text: 'hola', speaker: 'SPEAKER_01' },
        { start: 3, end: 4, text: '  ', speaker: 'SPEAKER_00' }, // se filtra (vacío)
        { start: 5, end: 6, text: 'sin hablante' } // → SPEAKER_00
      ]
    })
    expect(segs).toHaveLength(2)
    expect(segs[0]).toEqual({ inicioMs: 1200, finMs: 2500, speaker: 'SPEAKER_01', texto: 'hola' })
    expect(segs[1].speaker).toBe('SPEAKER_00')
  })

  it('lanza ante error del worker', () => {
    expect(() => parseWhisperXResponse({ ok: false, error: 'CUDA OOM' })).toThrow('CUDA OOM')
    expect(() => parseWhisperXResponse({ ok: true })).toThrow('segments')
  })

  it('extrae diarización sin texto', () => {
    const d = parseWhisperXDiarization({
      ok: true,
      segments: [{ start: 0, end: 1, text: 'x', speaker: 'SPEAKER_00' }]
    })
    expect(d[0]).toEqual({ inicioMs: 0, finMs: 1000, speaker: 'SPEAKER_00' })
  })
})

describe('WhisperXProvider', () => {
  it('envía diarize=false en transcribe y true en transcribeAndDiarize', async () => {
    const sent: WhisperXRequest[] = []
    const transport: WhisperXTransport = {
      send: async (req) => {
        sent.push(req)
        return { ok: true, segments: [{ start: 0, end: 1, text: 'hola', speaker: 'SPEAKER_00' }] }
      }
    }
    let n = 0
    const provider = new WhisperXProvider(transport, () => `id-${n++}`)
    await provider.transcribe({ path: 'mic.wav', label: 'mic' }, { lang: 'es', model: 'm', device: 'cuda' })
    await provider.transcribeAndDiarize(
      { path: 'sys.wav', label: 'system' },
      { lang: 'es', model: 'm', device: 'cuda', hfToken: 'hf_x' }
    )
    expect(sent[0].diarize).toBe(false)
    expect(sent[1].diarize).toBe(true)
    expect(sent[1].hfToken).toBe('hf_x')
    expect(sent[0].id).toBe('id-0')
  })
})

describe('whisper.cpp parser', () => {
  it('parsea offsets en ms y asigna hablante genérico', () => {
    const segs = parseWhisperCppJson({
      transcription: [
        { offsets: { from: 0, to: 1500 }, text: ' Hola ' },
        { offsets: { from: 1500, to: 3000 }, text: 'mundo' },
        { offsets: { from: 3000, to: 3200 }, text: '   ' } // se filtra
      ]
    })
    expect(segs).toHaveLength(2)
    expect(segs[0]).toEqual({ inicioMs: 0, finMs: 1500, speaker: 'SPEAKER_00', texto: 'Hola' })
  })

  it('lanza ante JSON inválido', () => {
    expect(() => parseWhisperCppJson({})).toThrow('transcription')
  })
})

describe('Ollama summary parser', () => {
  it('parsea JSON estructurado limpio', () => {
    const s = parseSummaryResponse(
      JSON.stringify({
        resumen: 'Se habló del presupuesto',
        puntos_clave: ['Aprobar gasto', 'Revisar plazos'],
        action_items: [{ descripcion: 'Enviar minuta', responsable: 'Max' }]
      }),
      'qwen3:8b'
    )
    expect(s.resumen).toBe('Se habló del presupuesto')
    expect(s.puntosClave).toHaveLength(2)
    expect(s.actionItems[0].responsable).toBe('Max')
    expect(s.modeloUsado).toBe('qwen3:8b')
  })

  it('extrae JSON aunque venga rodeado de texto', () => {
    const s = parseSummaryResponse(
      'Aquí tienes:\n{"resumen":"ok","puntos_clave":[],"action_items":[]}\n¡Listo!',
      'm'
    )
    expect(s.resumen).toBe('ok')
  })

  it('normaliza responsable null/variantes y filtra vacíos', () => {
    const s = parseSummaryResponse(
      JSON.stringify({
        resumen: 'r',
        puntos_clave: ['', 'válido'],
        action_items: [
          { descripcion: 'tarea1', responsable: 'null' },
          { description: 'tarea2', owner: 'Ana' },
          { descripcion: '' }
        ]
      }),
      'm'
    )
    expect(s.puntosClave).toEqual(['válido'])
    expect(s.actionItems).toHaveLength(2)
    expect(s.actionItems[0].responsable).toBeUndefined()
    expect(s.actionItems[1].responsable).toBe('Ana')
  })

  it('lanza si no hay JSON', () => {
    expect(() => parseSummaryResponse('sin json aquí', 'm')).toThrow()
  })
})

describe('Ollama helpers', () => {
  const segs: TranscriptSegment[] = [
    { inicioMs: 0, finMs: 1, speaker: 'Yo', texto: 'hola' },
    { inicioMs: 1, finMs: 2, speaker: 'Participante 1', texto: 'chao' }
  ]

  it('formatTranscript arma diálogo', () => {
    expect(formatTranscript(segs)).toBe('Yo: hola\nParticipante 1: chao')
  })

  it('chunkText respeta el máximo y no parte líneas', () => {
    const text = ['aaaa', 'bbbb', 'cccc'].join('\n')
    const chunks = chunkText(text, 9)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('').includes('aaaa')).toBe(true)
  })

  it('chunkText devuelve un solo trozo si cabe', () => {
    expect(chunkText('corto', 100)).toEqual(['corto'])
  })
})

describe('OllamaProvider', () => {
  it('hace una sola llamada estructurada para transcripción corta', async () => {
    const calls: Array<{ format?: string; messages: ChatMessage[] }> = []
    const transport: OllamaTransport = {
      chat: async (o) => {
        calls.push({ format: o.format, messages: o.messages })
        return '{"resumen":"corto","puntos_clave":[],"action_items":[]}'
      }
    }
    const provider = new OllamaProvider(transport)
    const summary = await provider.summarize(
      [{ inicioMs: 0, finMs: 1, speaker: 'Yo', texto: 'hola' }],
      { model: 'qwen3:8b' }
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].format).toBe('json')
    expect(summary.resumen).toBe('corto')
  })

  it('usa resumen jerárquico para transcripción larga', async () => {
    let structuredCalls = 0
    let plainCalls = 0
    const transport: OllamaTransport = {
      chat: async (o) => {
        if (o.format === 'json') {
          structuredCalls++
          return '{"resumen":"final","puntos_clave":[],"action_items":[]}'
        }
        plainCalls++
        return 'resumen parcial'
      }
    }
    const provider = new OllamaProvider(transport)
    // Generar > 12000 chars
    const big: TranscriptSegment[] = Array.from({ length: 1000 }, (_, i) => ({
      inicioMs: i,
      finMs: i + 1,
      speaker: 'Yo',
      texto: 'una línea bastante larga para inflar el tamaño total del texto'
    }))
    const summary = await provider.summarize(big, { model: 'm' })
    expect(plainCalls).toBeGreaterThan(0) // resúmenes parciales
    expect(structuredCalls).toBe(1) // una estructuración final
    expect(summary.resumen).toBe('final')
  })
})
