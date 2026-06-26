import type { RecordingStatus } from '@shared/types'

/** ms → "mm:ss" o "h:mm:ss". */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** ms absoluto (posición) → "mm:ss". */
export function formatTimestamp(ms: number): string {
  return formatDuration(ms)
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return iso
  }
}

/** ISO → "Hoy" / "Ayer" / "lun 23 jun" (para agrupar la línea de tiempo). */
export function formatDayGroup(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000)
    if (diffDays === 0) return 'Hoy'
    if (diffDays === 1) return 'Ayer'
    return d.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch {
    return iso
  }
}

/** ISO → "HH:mm" (hora local). */
export function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export const ESTADO_LABEL: Record<RecordingStatus, string> = {
  recording: 'Grabando',
  captured: 'Capturada',
  queued: 'En cola',
  processing: 'Transcribiendo',
  merging: 'Fusionando',
  summarizing: 'Resumiendo',
  completed: 'Lista',
  failed: 'Error'
}

export const ESTADO_KIND: Record<RecordingStatus, 'active' | 'pending' | 'done' | 'error'> = {
  recording: 'active',
  captured: 'pending',
  queued: 'pending',
  processing: 'active',
  merging: 'active',
  summarizing: 'active',
  completed: 'done',
  failed: 'error'
}
