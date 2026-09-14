import { test, expect, type Page, type Route } from '@playwright/test'
import { entrarConLaCuentaDePrueba, pedirCuentaDePrueba } from './cuentaDePrueba'

/**
 * Una subida en un bloque termina eligiendo su archivo aunque, mientras sube,
 * se pliegue el bloque, se mueva o se guarde la ficha. Contra la aplicación de
 * verdad.
 *
 * `tests/unit/plegarDuranteLaSubida.test.ts` monta el editor de bloques en un
 * DOM de prueba y cubre los casos uno a uno. Lo que no puede cubrir es lo que
 * pasa fuera de `Campos.tsx`: que la subida viaje de verdad por
 * `/api/subidas/medios`, que `FormularioDocumento` guarde y vuelva a tomar la
 * ficha del servidor, y que Payload devuelva los bloques en el orden en que se
 * mandaron —de eso depende `clavesQueRecibieronId`—. Aquí se hace todo eso con
 * la ficha, el guardado y la base de verdad.
 *
 * La subida se retiene con `page.route` hasta que la prueba ha terminado de
 * plegar y mover: así «mientras sube» dura lo que haga falta, y lo que llega
 * después es la respuesta real del servidor.
 *
 * Pide la cuenta de prueba, y sin ella se omite salvo con `EXIGIR_E2E_PANEL=1`:
 * ver `cuentaDePrueba.ts`. Cada prueba crea su propia ficha de borrador y la elimina al terminar. El
 * archivo subido se queda en la biblioteca de medios, con un nombre que dice de
 * dónde salió.
 */

/** Un PNG de un píxel: lo más pequeño que el servidor acepta como imagen. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('una subida en un bloque del editor de fichas', () => {
  pedirCuentaDePrueba()

  let fichaCreada: string | null = null

  test.beforeEach(async ({ page }) => {
    await entrarConLaCuentaDePrueba(page)
  })

  test.afterEach(async ({ page }) => {
    if (!fichaCreada) return
    const direccion = fichaCreada
    fichaCreada = null
    // Se acepta todo lo que pregunte: el «¿salir igual?» si quedó algo sin
    // guardar y el «¿eliminar?».
    page.on('dialog', (dialogo) => void dialogo.accept())
    await page.goto(direccion)
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await page.waitForURL((url) => url.pathname !== new URL(direccion).pathname)
  })

  /** Crea una patología de borrador y deja la pantalla en su pestaña «Definición». */
  async function abrirFichaNueva(page: Page) {
    await page.goto('/admin-panel/contenido/patologias/nuevo')
    await page.getByLabel('Nombre de la patología').fill(`Prueba e2e: subida durante el plegado ${Date.now()}`)
    const segmento = page.getByLabel('Segmento anatómico')
    await expect
      .poll(() => segmento.locator('option').count(), {
        message: 'La base no tiene ningún segmento anatómico: la ficha de prueba no se puede crear.',
      })
      .toBeGreaterThan(1)
    await segmento.selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await page.waitForURL(/\/admin-panel\/contenido\/patologias\/(?!nuevo$)[^/]+$/)
    fichaCreada = page.url()
    await page.locator('.editor-pestana', { hasText: 'Definición' }).click()
  }

  async function agregarBloque(page: Page, tipo: 'Imagen' | 'Video') {
    await page.getByRole('button', { name: '+ Agregar bloque' }).click()
    await page.locator('.bloques-menu').getByRole('button', { name: tipo, exact: true }).click()
  }

  /** Empieza a subir en el bloque `indice` y devuelve la petición, retenida. */
  async function empezarSubida(page: Page, indice: number, nombre: string): Promise<Route> {
    let retener!: (ruta: Route) => void
    const retenida = new Promise<Route>((resolver) => {
      retener = resolver
    })
    await page.route('**/api/subidas/medios', (ruta) => retener(ruta), { times: 1 })
    await page
      .locator('.bloque-editor')
      .nth(indice)
      .locator('input[type="file"]')
      .setInputFiles({ name: nombre, mimeType: 'image/png', buffer: PIXEL })
    return retenida
  }

  /** Suelta la subida retenida y espera a que el servidor conteste que la guardó. */
  async function soltar(page: Page, subida: Route) {
    const respuesta = page.waitForResponse('**/api/subidas/medios')
    await subida.continue()
    expect((await respuesta).ok(), 'el servidor rechazó la subida').toBe(true)
  }

  /**
   * El archivo elegido en el bloque `indice`, por su rótulo en el desplegable.
   * Por la etiqueta y no por `select` a secas: la imagen tiene otro, el ancho.
   */
  const elegidoEn = (page: Page, indice: number) =>
    page.locator('.bloque-editor').nth(indice).getByLabel(/^Archivo/).locator('option:checked')

  /** Guarda, recarga y vuelve a la pestaña: lo que se ve después es lo que quedó en la base. */
  async function guardarYRecargar(page: Page) {
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page.getByText('Borrador guardado.')).toBeVisible()
    await page.reload()
    await page.locator('.editor-pestana', { hasText: 'Definición' }).click()
  }

  test('plegada y subida al primer puesto mientras sube, la imagen queda elegida en su bloque', async ({ page }) => {
    await abrirFichaNueva(page)
    await agregarBloque(page, 'Video')
    await agregarBloque(page, 'Imagen')

    const subida = await empezarSubida(page, 1, 'e2e-plegar-y-mover.png')
    await page.getByRole('button', { name: 'Plegar imagen 2' }).click()
    await page.getByRole('button', { name: 'Subir imagen 2' }).click()
    await expect(page.locator('.bloque-editor').nth(0)).toHaveClass(/bloque-plegado/)
    await soltar(page, subida)

    await page.getByRole('button', { name: 'Desplegar imagen 1' }).click()
    await expect(elegidoEn(page, 0)).toContainText('e2e-plegar-y-mover')
    // Y en el vídeo, que ocupa ahora el sitio que tenía la imagen, nada.
    await expect(elegidoEn(page, 1)).toHaveText('— ninguno —')

    await guardarYRecargar(page)
    await expect(elegidoEn(page, 0)).toContainText('e2e-plegar-y-mover')
    await expect(elegidoEn(page, 1)).toHaveText('— ninguno —')
  })

  test('un bloque nuevo guardado mientras sube su imagen la recibe igual', async ({ page }) => {
    // El caso que la clave del cliente no cubría sola: al guardar, el bloque
    // vuelve del servidor con `id` y sin `_clave`, y la subida se había llevado
    // la clave de antes.
    await abrirFichaNueva(page)
    await agregarBloque(page, 'Imagen')

    const subida = await empezarSubida(page, 0, 'e2e-guardar-durante.png')
    await page.getByRole('button', { name: 'Plegar imagen 1' }).click()

    // Se espera a que la ficha vuelva del servidor, que es cuando cambian las
    // claves: el `router.refresh()` de después de guardar.
    const refresco = page.waitForResponse(
      (r) => r.request().method() === 'GET' && r.request().headers()['rsc'] === '1',
    )
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page.getByText('Borrador guardado.')).toBeVisible()
    // Entera, y un respiro: la respuesta llega por trozos y React la aplica
    // después. Soltar la subida antes sería probar el caso de siempre, el de
    // la clave sin cambiar, y la prueba saldría verde sin haber comprobado
    // nada. Se vio así: sin el arreglo, la aserción de plegado de abajo pasaba
    // igual cuando se esperaba solo a las cabeceras.
    await (await refresco).finished()
    await page.waitForTimeout(1_000)
    // Guardar no despliega el bloque: el plegado sigue al bloque, no a su clave.
    await expect(page.locator('.bloque-editor').nth(0)).toHaveClass(/bloque-plegado/)

    await soltar(page, subida)

    await page.getByRole('button', { name: 'Desplegar imagen 1' }).click()
    await expect(elegidoEn(page, 0)).toContainText('e2e-guardar-durante')

    await guardarYRecargar(page)
    await expect(elegidoEn(page, 0)).toContainText('e2e-guardar-durante')
  })
})
