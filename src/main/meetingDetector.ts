import { execFile } from 'node:child_process'
import { createLogger } from './logger'

const log = createLogger('meeting')

/**
 * Detección de reuniones por uso del micrófono (Windows).
 *
 * Windows registra en `ConsentStore\microphone` qué apps usan el micrófono:
 * mientras una app lo está usando, su valor `LastUsedTimeStop` es `0x0`.
 * Vigilamos eso para inferir "hay una reunión" sin tocar el sidecar Rust.
 */
const MIC_KEY =
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone'

// Excluimos el capturador propio (meetcap) para no auto-detectarnos.
const EXCLUDE = /meetcap/i

export interface MeetingDetectorOptions {
  isEnabled: () => boolean
  isRecording: () => boolean
  onStart: (appName: string) => void
  onEnd: () => void
}

/** Apps que están usando el micrófono ahora mismo (subclaves del registro). */
function queryMicUsers(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', MIC_KEY, '/s'],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([])
          return
        }
        const inUse: string[] = []
        let currentKey = ''
        for (const raw of stdout.split(/\r?\n/)) {
          const line = raw.trim()
          if (line.startsWith('HKEY_')) {
            currentKey = line
            continue
          }
          if (/LastUsedTimeStop\s+REG_QWORD\s+0x0\b/i.test(line)) {
            const seg = currentKey.split('\\').pop() ?? ''
            if (seg && !EXCLUDE.test(currentKey)) inUse.push(seg)
          }
        }
        resolve(inUse)
      }
    )
  })
}

/** "C:#Program Files#Zoom#bin#Zoom.exe" → "Zoom". */
function friendlyName(seg: string): string {
  const exe = seg.split('#').pop() ?? seg
  return exe.replace(/\.exe$/i, '') || 'una aplicación'
}

/**
 * Arranca el detector. Devuelve una función para detenerlo.
 * Confirma cada cambio en 2 lecturas seguidas para evitar parpadeos.
 */
export function startMeetingDetector(opts: MeetingDetectorOptions): () => void {
  if (process.platform !== 'win32') return () => {}

  let active = false
  let pending = 0
  let lastApp = 'una reunión'

  const tick = async (): Promise<void> => {
    if (!opts.isEnabled()) return
    const users = await queryMicUsers()
    const now = users.length > 0
    if (now === active) {
      pending = 0
      return
    }
    pending += 1
    if (pending < 2) return // confirmar el cambio
    pending = 0
    active = now
    if (now) {
      lastApp = friendlyName(users[0])
      log.info('Reunión detectada (micrófono en uso)', { app: lastApp })
      if (!opts.isRecording()) opts.onStart(lastApp)
    } else {
      log.info('Reunión terminada (micrófono liberado)')
      opts.onEnd()
    }
  }

  const id = setInterval(() => {
    void tick()
  }, 4000)
  return () => clearInterval(id)
}
