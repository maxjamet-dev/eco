import { describe, it, expect } from 'vitest'
import { speakerDisplayName } from './speakers'

describe('speakerDisplayName', () => {
  it('prioriza el nombre del usuario', () => {
    expect(speakerDisplayName('SPEAKER_00', 'Ana')).toBe('Ana')
    expect(speakerDisplayName('MIC', 'Max')).toBe('Max')
  })

  it('MIC → Yo', () => {
    expect(speakerDisplayName('MIC')).toBe('Yo')
    expect(speakerDisplayName('MIC', null)).toBe('Yo')
  })

  it('SPEAKER_NN → Participante N+1 (consistente en ambos paneles)', () => {
    expect(speakerDisplayName('SPEAKER_00')).toBe('Participante 1')
    expect(speakerDisplayName('SPEAKER_01')).toBe('Participante 2')
    expect(speakerDisplayName('SPEAKER_09')).toBe('Participante 10')
  })

  it('etiqueta desconocida o vacía', () => {
    expect(speakerDisplayName('RARO')).toBe('RARO')
    expect(speakerDisplayName(null)).toBe('Desconocido')
    expect(speakerDisplayName(undefined)).toBe('Desconocido')
  })

  it('nombre en blanco no cuenta', () => {
    expect(speakerDisplayName('SPEAKER_00', '   ')).toBe('Participante 1')
  })
})
