import { test, expect } from '@playwright/test'

/**
 * Recorridos de un visitante sin sesión.
 *
 * Es la comprobación que ninguna otra capa puede hacer: que la página que
 * realmente se sirve no filtre contenido. Las pruebas de integración verifican
 * la consulta; estas verifican el HTML que llega al navegador.
 */

const RUTAS_PROTEGIDAS = [
  '/biblioteca',
  '/examen-fisico',
  '/tecnica-ao',
  '/simulador',
  '/imagenes',
]

test.describe('visitante sin sesión', () => {
  test('la portada invita a entrar y no muestra contenido', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('traumatología')
    await expect(page.getByRole('link', { name: /iniciar sesión/i })).toBeVisible()
  })

  for (const ruta of RUTAS_PROTEGIDAS) {
    test(`${ruta} exige cuenta activa`, async ({ page }) => {
      await page.goto(ruta)
      await expect(page.getByText(/necesita una cuenta activa/i)).toBeVisible()
    })
  }

  test('no se filtra ningún nombre de ficha en el HTML servido', async ({ page }) => {
    const respuesta = await page.goto('/biblioteca')
    const html = (await respuesta?.text()) ?? ''
    // La ficha de demostración existe en la base; no debe aparecer para quien
    // no ha iniciado sesión.
    expect(html).not.toContain('Ficha de demostración')
  })

  test('la API de contenido responde 403', async ({ request }) => {
    const r = await request.get('/api/patologias')
    expect(r.status()).toBe(403)
  })

  test('el flujo de cambios exige sesión', async ({ request }) => {
    const r = await request.get('/api/cambios')
    expect(r.status()).toBe(401)
  })

  test('no se puede simular un rol sin sesión', async ({ request }) => {
    const r = await request.post('/api/vista-previa', { data: { rol: 'admin' } })
    expect(r.status()).toBe(401)
  })

  test('el panel muestra el formulario de acceso', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 20_000 })
  })

  test('la plataforma pide no ser indexada', async ({ page, request }) => {
    const robots = await request.get('/robots.txt')
    expect(await robots.text()).toContain('Disallow: /')

    const respuesta = await page.goto('/')
    expect(respuesta?.headers()['x-robots-tag']).toContain('noindex')
  })

  test('llegan las cabeceras de seguridad', async ({ page }) => {
    const respuesta = await page.goto('/')
    const cabeceras = respuesta?.headers() ?? {}
    expect(cabeceras['x-content-type-options']).toBe('nosniff')
    expect(cabeceras['x-frame-options']).toBe('SAMEORIGIN')
    expect(cabeceras['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })
})
