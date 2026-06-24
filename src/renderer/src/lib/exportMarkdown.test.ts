import { describe, it, expect } from 'vitest'
import { buildMarkdown, buildTranscriptText } from './exportMarkdown'
import type { RecordingDetail } from '@shared/types'

const detail: RecordingDetail = {
  recording: {
    id: 'r1',
    titulo: 'Reunión de kickoff',
    descripcion: 'Primera reunión con el cliente',
    fechaInicio: '2026-06-24T14:00:00.000Z',
    duracionMs: 120000,
    rutaAudioMic: null,
    rutaAudioSys: 'system.wav',
    offsetSysMs: 0,
    modo: 'online',
    estado: 'completed',
    backendUsado: 'cuda',
    projectId: 'p1',
    tipo: 'importada'
  },
  speakers: [
    { id: 1, recordingId: 'r1', etiqueta: 'SPEAKER_00', nombre: 'Ana', origen: 'diar' },
    { id: 2, recordingId: 'r1', etiqueta: 'SPEAKER_01', nombre: null, origen: 'diar' }
  ],
  segments: [
    { inicioMs: 0, finMs: 2000, speaker: 'Ana', texto: 'Hola, partamos.' },
    { inicioMs: 2000, finMs: 4000, speaker: 'Participante 2', texto: 'De acuerdo.' }
  ],
  summary: {
    resumen: 'Reunión inicial.',
    puntosClave: ['Definir alcance'],
    actionItems: [{ descripcion: 'Enviar propuesta', responsable: 'Ana' }],
    modeloUsado: 'qwen3:8b'
  },
  project: { id: 'p1', nombre: 'Cliente ACME', descripcion: 'Proyecto piloto', creadoEn: '2026-06-01T00:00:00Z' }
}

describe('buildMarkdown', () => {
  it('incluye contexto, proyecto, resumen, tareas y transcripción', () => {
    const md = buildMarkdown(detail)
    expect(md).toContain('# Reunión de kickoff')
    expect(md).toContain('**Proyecto:** Cliente ACME')
    expect(md).toContain('Primera reunión con el cliente') // descripción
    expect(md).toContain('Proyecto piloto') // descripción del proyecto
    expect(md).toContain('## Resumen')
    expect(md).toContain('- Definir alcance')
    expect(md).toContain('Enviar propuesta — _Ana_')
    expect(md).toContain('## Transcripción')
    expect(md).toContain('Ana:** Hola, partamos.')
    expect(md).toContain('**Origen:** audio importado')
  })

  it('buildTranscriptText devuelve solo la transcripción', () => {
    const tx = buildTranscriptText(detail)
    expect(tx).toContain('Ana: Hola, partamos.')
    expect(tx).toContain('Participante 2: De acuerdo.')
    expect(tx).not.toContain('## Resumen')
  })
})
