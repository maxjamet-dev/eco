import type { AppSettings, Device, HardwareInfo } from '@shared/types'

export interface BackendDecision {
  device: Device
  /** Proveedor de transcripción a usar: whisperX (CUDA) o whisper.cpp (CPU). */
  transcriptionProvider: 'whisperx' | 'whisper.cpp'
  /** ¿Se puede diarizar con calidad? (whisperX/pyannote requiere CUDA práctico). */
  diarizationDisponible: boolean
  motivo: string
}

/**
 * Selector de backend (SDD §7.1, §9.7). Resuelve el `device` y la implementación
 * de proveedor a partir del hardware detectado y la preferencia del usuario.
 *
 * - `auto`: usa CUDA si hay GPU NVIDIA; si no, CPU.
 * - `cuda`: fuerza CUDA (cae a CPU si no hay GPU, registrando el motivo).
 * - `cpu`: fuerza CPU (whisper.cpp, diarización degradada).
 */
export function selectBackend(hw: HardwareInfo, preferencia: AppSettings['backend']): BackendDecision {
  const cudaDisponible = hw.tieneCuda && hw.device === 'cuda'

  if (preferencia === 'cpu') {
    return {
      device: 'cpu',
      transcriptionProvider: 'whisper.cpp',
      diarizationDisponible: false,
      motivo: 'Backend CPU forzado por el usuario'
    }
  }

  if (preferencia === 'cuda') {
    if (cudaDisponible) {
      return {
        device: 'cuda',
        transcriptionProvider: 'whisperx',
        diarizationDisponible: true,
        motivo: 'CUDA forzado y disponible'
      }
    }
    return {
      device: 'cpu',
      transcriptionProvider: 'whisper.cpp',
      diarizationDisponible: false,
      motivo: 'CUDA forzado pero no hay GPU NVIDIA; se degrada a CPU'
    }
  }

  // auto
  if (cudaDisponible) {
    return {
      device: 'cuda',
      transcriptionProvider: 'whisperx',
      diarizationDisponible: true,
      motivo: `GPU NVIDIA detectada (${hw.gpuNombre ?? 'desconocida'})`
    }
  }
  return {
    device: 'cpu',
    transcriptionProvider: 'whisper.cpp',
    diarizationDisponible: false,
    motivo: 'Sin GPU NVIDIA; usando CPU con diarización degradada'
  }
}
