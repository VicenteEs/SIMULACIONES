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

  /**
   * La API REST de Payload, contra el servidor de verdad.
   *
   * Este bloque decía solo «la API de contenido responde 403» y miraba el
   * número. Seguía pasando, pero había dejado de comprobar lo que creía: aquel
   * 403 lo daba el `access.read` de la colección —la sesión que faltaba—, y
   * desde que se cerró esa API lo da antes el comodín de
   * `src/app/(payload)/api/[...slug]/route.ts`, que no mira la sesión. Sin
   * sesión los dos contestan igual, así que el número solo no distingue la API
   * cerrada de la API abierta: la prueba habría seguido verde con el agujero
   * reabierto. Por eso ahora se mira también quién contesta, que se reconoce
   * por el mensaje.
   */
  test('la API de contenido está cerrada, y la cierra la guardia de la ruta', async ({
    request,
  }) => {
    const r = await request.get('/api/patologias')
    expect(r.status()).toBe(403)
    expect(await r.text()).toContain('panel de TraumaHub')
  })

  test('el listado de medios ya no devuelve el inventario de archivos', async ({ request }) => {
    // El agujero concreto que se cerró: `GET /api/medios?limit=500` entregaba
    // nombre, tipo y dirección de todos los archivos —borradores incluidos— a
    // cualquier cuenta activa. Aquí se pide sin sesión, que es lo que esta
    // suite puede hacer; lo que prueba es que la respuesta la da la guardia y
    // no el control de acceso, o sea que con sesión sería la misma.
    const r = await request.get('/api/medios?limit=500')
    expect(r.status()).toBe(403)
    expect(await r.text()).toContain('panel de TraumaHub')
  })

  test('tampoco se entra por la API REST: dejaría la cookie en la raíz', async ({ request }) => {
    // `generatePayloadCookie` escribe siempre con `path: '/'`, sin mirar la
    // configuración, y esa cookie gana sobre la del prefijo: quien entrara por
    // aquí dejaría al siguiente autenticado con su cuenta. Se comprueba además
    // que no vuelva una sola cookie, que es lo que de verdad hace daño.
    const r = await request.post('/api/usuarios/login', {
      data: { email: 'quien-sea@hospital.cl', password: 'da-igual-cual-sea' },
    })
    expect(r.status()).toBe(403)
    expect(r.headers()['set-cookie']).toBeUndefined()
  })

  test('la ruta del archivo subido sigue llegando a Payload', async ({ request }) => {
    // La otra mitad, y la que no se puede romper: `<colección>/file/<nombre>` es
    // la ruta con la que Payload entrega cada imagen, vídeo y modelo 3D, y es
    // la que llevan los `<img>` de toda la plataforma. Cerrarla dejaría toda
    // ficha sin ilustraciones, y ninguna otra prueba de aquí lo vería.
    //
    // Sin sesión la respuesta es que no —eso lo decide el `access.read` de
    // Medios—, así que lo que se mira no es el número sino que el motivo NO sea
    // el de la guardia: si el comodín se la tragara, aquí aparecería su
    // mensaje.
    const r = await request.get('/api/medios/file/no-existe.png')
    expect(await r.text()).not.toContain('panel de TraumaHub')
  })

  test('el flujo de cambios exige sesión', async ({ request }) => {
    const r = await request.get('/api/cambios')
    expect(r.status()).toBe(401)
  })

  test('no se puede simular un rol sin sesión', async ({ request }) => {
    const r = await request.post('/api/vista-previa', { data: { rol: 'admin' } })
    expect(r.status()).toBe(401)
  })

  test('la pantalla de entrada propia pide correo y contraseña', async ({ page }) => {
    await page.goto('/entrar')
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test('la ruta antigua del panel de Payload lleva a la propia', async ({ page }) => {
    await page.goto('/admin')
    // Sin sesión, el panel propio devuelve a la portada; con sesión, al panel.
    expect(page.url()).not.toContain('/admin/login')
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
