import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from './paths'
import { createLogger } from './logger'

const log = createLogger('secrets')

/**
 * Almacén de secretos (SDD §13): token de Hugging Face y futuras API keys.
 * Cifrado con `safeStorage` del SO (DPAPI en Windows). Nunca en texto plano,
 * nunca expuesto al renderer.
 */
function secretFile(name: string): string {
  return join(dataDir(), `${name}.bin`)
}

export function setSecret(name: string, value: string): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('safeStorage no disponible; no se guarda el secreto')
      return false
    }
    const encrypted = safeStorage.encryptString(value)
    writeFileSync(secretFile(name), encrypted)
    return true
  } catch (e) {
    log.error('Error guardando secreto', String(e))
    return false
  }
}

export function getSecret(name: string): string | undefined {
  try {
    const file = secretFile(name)
    if (!existsSync(file)) return undefined
    if (!safeStorage.isEncryptionAvailable()) return undefined
    const buf = readFileSync(file)
    return safeStorage.decryptString(buf)
  } catch (e) {
    log.error('Error leyendo secreto', String(e))
    return undefined
  }
}

export function hasSecret(name: string): boolean {
  return existsSync(secretFile(name))
}

export const HF_TOKEN_KEY = 'hf_token'
