import { createLogger } from './logger'

const log = createLogger('hf')

export interface HfValidation {
  /** El token es válido (sesión reconocida por Hugging Face). */
  validToken: boolean
  /** Nombre de usuario asociado al token. */
  user: string | null
  /** Tiene acceso a los modelos de pyannote (licencias aceptadas). */
  accessOk: boolean
}

/** ¿El token tiene acceso de descarga a un modelo gated? (licencia aceptada) */
async function hasAccess(model: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://huggingface.co/${model}/resolve/main/config.yaml`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'follow'
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Valida un token de Hugging Face: que sea válido (whoami) y que tenga acceso a
 * los modelos de diarización (segmentation-3.0 + speaker-diarization-3.1).
 */
export async function validateHfToken(token: string): Promise<HfValidation> {
  const t = token.trim()
  if (!t) return { validToken: false, user: null, accessOk: false }

  let validToken = false
  let user: string | null = null
  try {
    const who = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: { Authorization: `Bearer ${t}` }
    })
    if (who.ok) {
      validToken = true
      const j = (await who.json()) as { name?: string; fullname?: string }
      user = j.fullname || j.name || null
    }
  } catch (e) {
    log.error('whoami', String(e))
  }

  let accessOk = false
  if (validToken) {
    const [seg, diar] = await Promise.all([
      hasAccess('pyannote/segmentation-3.0', t),
      hasAccess('pyannote/speaker-diarization-3.1', t)
    ])
    accessOk = seg && diar
  }

  return { validToken, user, accessOk }
}
