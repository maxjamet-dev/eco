import { describe, it, expect } from 'vitest'
import { mergeTracks, distinctSpeakers, type RawSegment } from './trackMerger'

const mic: RawSegment[] = [
  { inicioMs: 0, finMs: 1000, texto: 'Hola a todos' },
  { inicioMs: 4000, finMs: 5000, texto: 'Perfecto, gracias' }
]

const sys: RawSegment[] = [
  { inicioMs: 1500, finMs: 2500, texto: 'Hola, ¿me escuchan?', etiqueta: 'SPEAKER_00' },
  { inicioMs: 2600, finMs: 3500, texto: 'Sí, fuerte y claro', etiqueta: 'SPEAKER_01' }
]

describe('mergeTracks (online)', () => {
  it('intercala por tiempo y etiqueta el micrófono como MIC', () => {
    const out = mergeTracks({ micSegments: mic, systemSegments: sys, offsetSysMs: 0, modo: 'online' })
    expect(out.map((s) => s.texto)).toEqual([
      'Hola a todos',
      'Hola, ¿me escuchan?',
      'Sí, fuerte y claro',
      'Perfecto, gracias'
    ])
    expect(out[0].etiqueta).toBe('MIC')
    expect(out[1].etiqueta).toBe('SPEAKER_00')
  })

  it('aplica el offset a la pista del sistema', () => {
    const out = mergeTracks({ micSegments: mic, systemSegments: sys, offsetSysMs: 3000, modo: 'online' })
    // El primer segmento del sistema (1500+3000=4500) ahora va tras "Perfecto" (4000)
    const sysFirst = out.find((s) => s.texto.includes('escuchan'))!
    expect(sysFirst.inicioMs).toBe(4500)
    const orderTextos = out.map((s) => s.texto)
    expect(orderTextos.indexOf('Perfecto, gracias')).toBeLessThan(orderTextos.indexOf('Hola, ¿me escuchan?'))
  })

  it('offset negativo no produce tiempos negativos', () => {
    const out = mergeTracks({
      micSegments: [],
      systemSegments: [{ inicioMs: 100, finMs: 200, texto: 'x', etiqueta: 'SPEAKER_00' }],
      offsetSysMs: -1000,
      modo: 'online'
    })
    expect(out[0].inicioMs).toBe(0)
    expect(out[0].finMs).toBe(0)
  })

  it('sin diarización en el sistema, asigna hablante genérico', () => {
    const out = mergeTracks({
      micSegments: [],
      systemSegments: [{ inicioMs: 0, finMs: 100, texto: 'los demás' }],
      offsetSysMs: 0,
      modo: 'online'
    })
    expect(out[0].etiqueta).toBe('SPEAKER_00')
  })
})

describe('mergeTracks (presencial)', () => {
  it('usa solo el micrófono diarizado e ignora el sistema', () => {
    const out = mergeTracks({
      micSegments: [
        { inicioMs: 0, finMs: 1000, texto: 'A habla', etiqueta: 'SPEAKER_00' },
        { inicioMs: 1000, finMs: 2000, texto: 'B habla', etiqueta: 'SPEAKER_01' }
      ],
      systemSegments: sys,
      offsetSysMs: 0,
      modo: 'presencial'
    })
    expect(out).toHaveLength(2)
    expect(out.map((s) => s.etiqueta)).toEqual(['SPEAKER_00', 'SPEAKER_01'])
  })
})

describe('distinctSpeakers', () => {
  it('devuelve etiquetas únicas en orden de aparición', () => {
    const out = mergeTracks({ micSegments: mic, systemSegments: sys, offsetSysMs: 0, modo: 'online' })
    expect(distinctSpeakers(out)).toEqual(['MIC', 'SPEAKER_00', 'SPEAKER_01'])
  })
})
