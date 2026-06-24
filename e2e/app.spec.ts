import { test, expect, _electron as electron } from '@playwright/test'

/**
 * E2E de humo: la app de Electron arranca y renderiza el shell.
 *
 * Nota: en este entorno better-sqlite3 aún no está compilado (requiere MSVC),
 * por lo que el backend/IPC puede no inicializar; este test valida que la
 * ventana abre y la UI se monta. Los flujos completos (grabar→procesar→ver)
 * se habilitan tras compilar el módulo nativo y el binario de captura.
 */
test('la aplicación arranca y muestra el shell', async () => {
  // Electron debe arrancar en modo app (no como Node): ELECTRON_RUN_AS_NODE
  // heredado del entorno haría que rechace los flags de Chromium de Playwright.
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v
  }
  env.NODE_ENV = 'test'

  const electronApp = await electron.launch({ args: ['.'], cwd: process.cwd(), env })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  // El logo/título del header debe estar presente.
  await expect(window.locator('.app-logo')).toHaveText('Grabador de Reuniones', {
    timeout: 15_000
  })

  // El badge "100% local" confirma el branding de privacidad.
  await expect(window.locator('.badge')).toHaveText('100% local')

  const title = await window.title()
  expect(title).toContain('Grabador de Reuniones')

  await electronApp.close()
})
