import { describe, it, expect } from 'vitest'
import { parseSpeakerNames, buildSpeakerTranscript } from './speakerNames'

describe('parseSpeakerNames', () => {
  it('parsea JSON limpio de etiqueta→nombre', () => {
    const r = parseSpeakerNames('{"Participante 1":"Ana","Participante 3":"Pedro"}')
    expect(r).toEqual({ 'Participante 1': 'Ana', 'Participante 3': 'Pedro' })
  })

  it('extrae el JSON aunque venga rodeado de texto', () => {
    const r = parseSpeakerNames('Claro:\n{"Participante 2":"Luz"}\nlisto')
    expect(r).toEqual({ 'Participante 2': 'Luz' })
  })

  it('descarta valores vacíos o "null"', () => {
    const r = parseSpeakerNames('{"Participante 1":"","Participante 2":"null","Participante 3":"Eva"}')
    expect(r).toEqual({ 'Participante 3': 'Eva' })
  })

  it('devuelve {} ante contenido inválido', () => {
    expect(parseSpeakerNames('sin json')).toEqual({})
    expect(parseSpeakerNames('')).toEqual({})
  })
})

describe('buildSpeakerTranscript', () => {
  it('agrupa hablante: texto y recorta al máximo', () => {
    const segs = [
      { speaker: 'Participante 1', texto: 'hola' },
      { speaker: 'Yo', texto: 'chao' }
    ]
    expect(buildSpeakerTranscript(segs)).toBe('Participante 1: hola\nYo: chao')
    expect(buildSpeakerTranscript(segs, 5).length).toBe(5)
  })
})
