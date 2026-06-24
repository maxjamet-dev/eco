import { execFile } from 'node:child_process'
import type { HardwareInfo } from '@shared/types'
import { createLogger } from '../logger'

const log = createLogger('hardware')

/**
 * Parser puro de la salida de `nvidia-smi --query-gpu=...`.
 * Formato esperado (CSV sin encabezado): "name, memoryMiB, driver".
 */
export function parseNvidiaSmi(stdout: string): HardwareInfo | null {
  const line = stdout
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!line) return null
  const parts = line.split(',').map((p) => p.trim())
  if (parts.length < 1 || !parts[0]) return null
  const gpuNombre = parts[0]
  const vramMb = parts[1] ? parseInt(parts[1].replace(/[^\d]/g, ''), 10) || null : null
  const driverVersion = parts[2] || null
  return {
    tieneCuda: true,
    gpuNombre,
    vramMb,
    device: 'cuda',
    driverVersion
  }
}

const CPU_INFO: HardwareInfo = {
  tieneCuda: false,
  gpuNombre: null,
  vramMb: null,
  device: 'cpu',
  driverVersion: null
}

export type CommandRunner = (bin: string, args: string[]) => Promise<string>

const defaultRunner: CommandRunner = (bin, args) =>
  new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 8000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })

/**
 * Detecta GPU NVIDIA/CUDA vía `nvidia-smi` (SDD §9.7). Cachea el resultado.
 */
export class HardwareDetector {
  private cache: HardwareInfo | null = null

  constructor(private readonly runner: CommandRunner = defaultRunner) {}

  async detect(force = false): Promise<HardwareInfo> {
    if (this.cache && !force) return this.cache
    try {
      const out = await this.runner('nvidia-smi', [
        '--query-gpu=name,memory.total,driver_version',
        '--format=csv,noheader'
      ])
      const info = parseNvidiaSmi(out)
      this.cache = info ?? CPU_INFO
    } catch (e) {
      log.info('nvidia-smi no disponible; usando CPU', String(e))
      this.cache = CPU_INFO
    }
    return this.cache
  }

  clearCache(): void {
    this.cache = null
  }
}
