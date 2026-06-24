import { describe, it, expect } from 'vitest'
import { parseNvidiaSmi, HardwareDetector } from './detect'
import { selectBackend } from './backendSelector'
import type { HardwareInfo } from '@shared/types'

describe('parseNvidiaSmi', () => {
  it('parsea nombre, VRAM y driver', () => {
    const info = parseNvidiaSmi('NVIDIA GeForce RTX 5070 Laptop GPU, 8151 MiB, 610.47')!
    expect(info.tieneCuda).toBe(true)
    expect(info.gpuNombre).toBe('NVIDIA GeForce RTX 5070 Laptop GPU')
    expect(info.vramMb).toBe(8151)
    expect(info.device).toBe('cuda')
    expect(info.driverVersion).toBe('610.47')
  })

  it('devuelve null con salida vacía', () => {
    expect(parseNvidiaSmi('')).toBeNull()
    expect(parseNvidiaSmi('\n  \n')).toBeNull()
  })
})

describe('HardwareDetector', () => {
  it('detecta CUDA cuando nvidia-smi responde, y cachea', async () => {
    let calls = 0
    const detector = new HardwareDetector(async () => {
      calls++
      return 'RTX 5070, 8151 MiB, 610.47'
    })
    const a = await detector.detect()
    const b = await detector.detect()
    expect(a.device).toBe('cuda')
    expect(calls).toBe(1) // cacheado
    expect(b).toBe(a)
  })

  it('cae a CPU si nvidia-smi falla', async () => {
    const detector = new HardwareDetector(async () => {
      throw new Error('no encontrado')
    })
    const info = await detector.detect()
    expect(info.device).toBe('cpu')
    expect(info.tieneCuda).toBe(false)
  })
})

describe('selectBackend', () => {
  const cuda: HardwareInfo = {
    tieneCuda: true,
    gpuNombre: 'RTX 5070',
    vramMb: 8151,
    device: 'cuda',
    driverVersion: '610.47'
  }
  const cpu: HardwareInfo = {
    tieneCuda: false,
    gpuNombre: null,
    vramMb: null,
    device: 'cpu',
    driverVersion: null
  }

  it('auto con CUDA → whisperX + diarización', () => {
    const d = selectBackend(cuda, 'auto')
    expect(d.device).toBe('cuda')
    expect(d.transcriptionProvider).toBe('whisperx')
    expect(d.diarizationDisponible).toBe(true)
  })

  it('auto sin GPU → whisper.cpp degradado', () => {
    const d = selectBackend(cpu, 'auto')
    expect(d.device).toBe('cpu')
    expect(d.transcriptionProvider).toBe('whisper.cpp')
    expect(d.diarizationDisponible).toBe(false)
  })

  it('cuda forzado sin GPU cae a CPU con motivo', () => {
    const d = selectBackend(cpu, 'cuda')
    expect(d.device).toBe('cpu')
    expect(d.motivo).toMatch(/degrada/i)
  })

  it('cpu forzado ignora la GPU', () => {
    const d = selectBackend(cuda, 'cpu')
    expect(d.device).toBe('cpu')
    expect(d.transcriptionProvider).toBe('whisper.cpp')
  })
})
