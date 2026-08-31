import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas de extremo a extremo.
 *
 * Recorren la aplicación con un navegador real, que es lo único capaz de
 * comprobar lo que ni las unitarias ni las de integración alcanzan: que un
 * visitante sin sesión no vea contenido en la página que realmente se sirve.
 *
 * Exigen la aplicación en marcha. Si no lo está, Playwright la levanta.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,

  use: {
    baseURL: process.env.URL_PRUEBAS || 'http://localhost:3000',
    // Rastro solo del primer reintento: guardar siempre llena el disco sin
    // aportar nada cuando todo pasa.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'es-CL',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
