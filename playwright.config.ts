import { defineConfig } from '@playwright/test'

// E2E sobre Electron empaquetado. Los specs lanzan la app vía electron.launch().
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure'
  }
})
