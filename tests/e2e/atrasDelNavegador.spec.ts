import { test, expect, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { join } from 'node:path'
import { entrarConLaCuentaDePrueba, pedirCuentaDePrueba } from './cuentaDePrueba'

/**
 * Atrás y Adelante del navegador preguntan antes de sacar de una pantalla con
 * cambios sin guardar, en un Chromium de verdad.
 *
 * `tests/unit/atrasDelNavegador.test.ts` prueba la lógica con un navegador de
 * juguete que reproduce lo que se midió. Lo que el juguete no puede probar es
 * que esas medidas sigan siendo ciertas: que `currententrychange` llegue antes
 * que `popstate`, que tapar el `state` en el prototipo de `PopStateEvent` lo
 * tape de verdad para el oyente de al lado, que `history.go` deshaga el viaje
 * sin dejar una entrada de más, que Atrás pulsado desde fuera de la página
 * —`page.goBack()` va por el navegador, como el botón— siga el mismo camino. Si
 * una versión de Chromium cambia cualquiera de esas cosas, esto es lo que falla.
 *
 * ## Qué es de verdad y qué no
 *
 * De verdad: el navegador, `GuardiaDeAtras` tal como la monta el `layout.tsx`
 * del panel —con React, en `StrictMode`— y el registro de
 * `src/admin/salidaDelEditor.ts`, empaquetados con esbuild desde la fuente.
 *
 * No de verdad: el router. En su lugar hay un oyente de `popstate` que hace lo
 * único de `onPopState` de Next de lo que depende la guardia —ignorar el evento
 * sin `state`, `next/dist/client/components/app-router.js`— y cuenta lo que ve.
 * Que Next siga haciendo eso lo vigila la prueba unitaria leyendo su código.
 * Ese primer grupo no necesita la aplicación en marcha: la página se sirve
 * desde `page.route` en un origen inventado. Playwright levanta igual el
 * `webServer` de `playwright.config.ts`, que es de todo el directorio.
 *
 * El último grupo sí va contra el panel de verdad, con el router de Next y el
 * editor de fichas, y por eso pide cuenta: ver `cuentaDePrueba.ts`. Es el que
 * comprueba que el oyente de imitación de arriba no se ha quedado atrás del de
 * verdad.
 */

const ORIGEN = 'http://guardia.prueba'

let paquete = ''

test.beforeAll(async () => {
  const raiz = process.cwd()
  const resultado = await build({
    stdin: {
      contents: `
        import { createElement, StrictMode } from 'react'
        import { createRoot } from 'react-dom/client'
        import { GuardiaDeAtras } from '@/components/admin/GuardiaDeAtras'
        import { apuntarCambiosSinGuardar, PREGUNTA_DE_SALIDA } from '@/admin/salidaDelEditor'

        let desapuntar = null
        let raiz = null
        window.prueba = {
          PREGUNTA_DE_SALIDA,
          montarGuardia() {
            raiz = createRoot(document.getElementById('panel'))
            raiz.render(createElement(StrictMode, null, createElement(GuardiaDeAtras)))
          },
          desmontarGuardia() {
            raiz?.unmount()
            raiz = null
          },
          apuntarCambios() {
            desapuntar = apuntarCambiosSinGuardar()
          },
          guardar() {
            desapuntar?.()
            desapuntar = null
          },
        }
      `,
      resolveDir: raiz,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    write: false,
    // Lee los `paths` de `tsconfig.json` para resolver `@/`.
    tsconfig: join(raiz, 'tsconfig.json'),
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'error',
  })
  paquete = resultado.outputFiles[0].text
})

/**
 * Abre el «panel» en `rutas[rutas.length - 1]` con las anteriores detrás en el
 * historial, apiladas como las apila el router de Next: `pushState` con estado.
 */
async function abrirPanel(
  page: Page,
  rutas: string[],
  { guardiaAntesQueElRouter = false }: { guardiaAntesQueElRouter?: boolean } = {},
) {
  await page.route(`${ORIGEN}/**`, (ruta) =>
    ruta.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><meta charset="utf-8"><div id="panel"></div><script>${paquete.replace(/<\/script/gi, '<\\/script')}</script>`,
    }),
  )
  await page.goto(`${ORIGEN}${rutas[0]}`)
  await page.evaluate((rutas) => {
    const w = window as unknown as { router: { vistas: string[]; registrar(): void } }
    // El oyente de Next, reducido a lo que importa: ignora el evento sin
    // `state` y, con él, pinta la pantalla de destino. Aquí la apunta.
    w.router = {
      vistas: [],
      registrar: () =>
        window.addEventListener('popstate', (evento) => {
          if (!evento.state) return
          w.router.vistas.push(location.pathname)
        }),
    }
    history.replaceState({ __NA: true }, '', rutas[0])
    for (const ruta of rutas.slice(1)) history.pushState({ __NA: true }, '', ruta)
  }, rutas)

  // Casi siempre Next se registra antes que la guardia, porque vive en la raíz;
  // al revés cuando se entra al panel cargando la página. Las dos órdenes
  // tienen su prueba, y para la segunda hay que esperar a que la guardia esté
  // puesta de verdad: `montarGuardia` solo pide el pintado, y el efecto de
  // React corre después. Registrar el router en la misma tarea lo dejaría
  // delante sin que la prueba lo supiera.
  const registrarRouter = () =>
    page.evaluate(() => (window as unknown as { router: { registrar(): void } }).router.registrar())
  if (!guardiaAntesQueElRouter) await registrarRouter()
  await page.evaluate(() => (window as unknown as { prueba: { montarGuardia(): void } }).prueba.montarGuardia())
  // Puesta se nota en que `PopStateEvent` ya no trae el accesor de fábrica.
  await page.waitForFunction(() => {
    const accesor = Object.getOwnPropertyDescriptor(PopStateEvent.prototype, 'state')
    return accesor?.get?.toString().includes('[native code]') === false
  })
  if (guardiaAntesQueElRouter) await registrarRouter()
}

const vistasDelRouter = (page: Page) =>
  page.evaluate(() => (window as unknown as { router: { vistas: string[] } }).router.vistas)

const posicion = (page: Page) =>
  page.evaluate(() => {
    const navegacion = (window as unknown as { navigation: { currentEntry: { index: number }; entries(): unknown[] } })
      .navigation
    return { ruta: location.pathname, indice: navegacion.currentEntry.index, entradas: navegacion.entries().length }
  })

const apuntarCambios = (page: Page) =>
  page.evaluate(() => (window as unknown as { prueba: { apuntarCambios(): void } }).prueba.apuntarCambios())

/** Contesta cada pregunta con `respuesta` y devuelve la lista de las que hubo. */
function contestar(page: Page, respuesta: 'aceptar' | 'cancelar') {
  const preguntas: string[] = []
  page.on('dialog', (dialogo) => {
    preguntas.push(dialogo.message())
    void (respuesta === 'aceptar' ? dialogo.accept() : dialogo.dismiss())
  })
  return preguntas
}

/** Lo que tarda en asentarse un viaje y, si lo hay, su vuelta. */
const asentarse = (page: Page) => page.waitForTimeout(300)

const LISTADO = '/admin-panel/contenido/patologias'
const FICHA = '/admin-panel/contenido/patologias/1'

test.describe('Atrás y Adelante con cambios sin guardar', () => {
  test('sin cambios, Atrás navega sin preguntar y el router lo ve', async ({ page }) => {
    await abrirPanel(page, [LISTADO, FICHA])
    const preguntas = contestar(page, 'cancelar')
    await page.goBack({ waitUntil: 'commit' })
    await asentarse(page)
    expect(preguntas).toEqual([])
    expect((await posicion(page)).ruta).toBe(LISTADO)
    expect(await vistasDelRouter(page)).toEqual([LISTADO])
  })

  test('cancelar deja la ficha donde estaba, sin entradas de más y sin que el router se entere', async ({ page }) => {
    await abrirPanel(page, [LISTADO, FICHA])
    const antes = await posicion(page)
    await apuntarCambios(page)
    const preguntas = contestar(page, 'cancelar')

    await page.goBack({ waitUntil: 'commit' })
    await asentarse(page)

    expect(preguntas).toEqual([await page.evaluate(() => (window as unknown as { prueba: { PREGUNTA_DE_SALIDA: string } }).prueba.PREGUNTA_DE_SALIDA)])
    expect(await posicion(page)).toEqual(antes)
    expect(await vistasDelRouter(page)).toEqual([])
  })

  test('aceptar sale, y el router ve el viaje una vez', async ({ page }) => {
    await abrirPanel(page, [LISTADO, FICHA])
    await apuntarCambios(page)
    const preguntas = contestar(page, 'aceptar')

    await page.goBack({ waitUntil: 'commit' })
    await asentarse(page)

    expect(preguntas).toHaveLength(1)
    expect((await posicion(page)).ruta).toBe(LISTADO)
    expect(await vistasDelRouter(page)).toEqual([LISTADO])
  })

  test('Adelante pregunta igual y, cancelado, vuelve atrás', async ({ page }) => {
    await abrirPanel(page, [LISTADO, FICHA])
    // Sin cambios todavía: se vuelve al listado, que aquí hace de taller.
    await page.goBack({ waitUntil: 'commit' })
    await asentarse(page)
    await apuntarCambios(page)
    const preguntas = contestar(page, 'cancelar')

    await page.goForward({ waitUntil: 'commit' })
    await asentarse(page)

    expect(preguntas).toHaveLength(1)
    expect(await posicion(page)).toMatchObject({ ruta: LISTADO, indice: 0, entradas: 2 })
    expect(await vistasDelRouter(page)).toEqual([LISTADO])
  })

  test('cancelar dos veces seguidas pregunta dos veces y no mueve nada', async ({ page }) => {
    await abrirPanel(page, [LISTADO, FICHA])
    const antes = await posicion(page)
    await apuntarCambios(page)
    const preguntas = contestar(page, 'cancelar')

    await page.goBack({ waitUntil: 'commit' })
    await asentarse(page)
    await page.goBack({ waitUntil: 'commit' })
    await asentarse(page)

    expect(preguntas).toHaveLength(2)
    expect(await posicion(page)).toEqual(antes)
    expect(await vistasDelRouter(page)).toEqual([])
  })

  test('un salto de varias entradas vuelve las mismas', async ({ page }) => {
    await abrirPanel(page, ['/admin-panel', '/admin-panel/comentarios', LISTADO, FICHA])
    const antes = await posicion(page)
    await apuntarCambios(page)
    const preguntas = contestar(page, 'cancelar')

    await page.evaluate(() => history.go(-3))
    await asentarse(page)

    expect(preguntas).toHaveLength(1)
    expect(await posicion(page)).toEqual(antes)
    expect(await vistasDelRouter(page)).toEqual([])
  })

  test('igual si la guardia se registra antes que el router', async ({ page }) => {
    await abrirPanel(page, [LISTADO, FICHA], { guardiaAntesQueElRouter: true })
    const antes = await posicion(page)
    await apuntarCambios(page)
    contestar(page, 'cancelar')

    await page.goBack({ waitUntil: 'commit' })
    await asentarse(page)

    expect(await posicion(page)).toEqual(antes)
    expect(await vistasDelRouter(page)).toEqual([])
  })

  test('después de cancelar y guardar, Atrás vuelve a llegar al router con su estado', async ({ page }) => {
    // Si la tapa del `state` no se levantara, el router dejaría de ver los
    // viajes para siempre: el panel entero dejaría de responder a Atrás.
    await abrirPanel(page, [LISTADO, FICHA])
    await apuntarCambios(page)
    const preguntas = contestar(page, 'cancelar')
    await page.goBack({ waitUntil: 'commit' })
    await asentarse(page)

    await page.evaluate(() => (window as unknown as { prueba: { guardar(): void } }).prueba.guardar())
    await page.goBack({ waitUntil: 'commit' })
    await asentarse(page)

    expect(preguntas).toHaveLength(1)
    expect(await posicion(page)).toMatchObject({ ruta: LISTADO, entradas: 2 })
    expect(await vistasDelRouter(page)).toEqual([LISTADO])
  })

  test('desmontar la guardia devuelve `PopStateEvent` a su estado de fábrica', async ({ page }) => {
    await abrirPanel(page, [LISTADO, FICHA])
    await page.evaluate(() => (window as unknown as { prueba: { desmontarGuardia(): void } }).prueba.desmontarGuardia())
    const deFabrica = await page.evaluate(() =>
      Object.getOwnPropertyDescriptor(PopStateEvent.prototype, 'state')?.get?.toString().includes('[native code]'),
    )
    expect(deFabrica).toBe(true)
  })
})

test.describe('en el panel de verdad', () => {
  pedirCuentaDePrueba()

  const NOMBRE = 'Prueba e2e: Atrás con cambios sin guardar'

  /**
   * Del listado a una ficha nueva por el botón, que es navegación de cliente:
   * las dos direcciones quedan en el mismo documento, que es donde Atrás es un
   * `popstate` y no una descarga. Deja algo escrito sin guardar.
   */
  async function fichaAMedias(page: Page) {
    await entrarConLaCuentaDePrueba(page)
    await page.goto('/admin-panel/contenido/patologias')
    await page.getByRole('link', { name: /Agregar Patología/ }).click()
    await page.waitForURL(/\/patologias\/nuevo$/)
    await page.getByLabel('Nombre de la patología').fill(NOMBRE)
  }

  test('Atrás pregunta y, cancelado, deja la ficha con lo escrito', async ({ page }) => {
    await fichaAMedias(page)
    const preguntas = contestar(page, 'cancelar')

    await page.goBack({ waitUntil: 'commit' })
    await asentarse(page)

    expect(preguntas).toHaveLength(1)
    expect(preguntas[0]).toContain('Hay cambios sin guardar en esta pantalla')
    await expect(page).toHaveURL(/\/patologias\/nuevo$/)
    // Lo que se quería salvar: si el router hubiera visto el viaje, habría
    // pintado el listado y desmontado el formulario con la pregunta abierta.
    await expect(page.getByLabel('Nombre de la patología')).toHaveValue(NOMBRE)
  })

  test('aceptando, Atrás sale al listado', async ({ page }) => {
    await fichaAMedias(page)
    const preguntas = contestar(page, 'aceptar')

    await page.goBack({ waitUntil: 'commit' })

    await expect(page).toHaveURL(/\/patologias$/)
    await expect(page.getByRole('link', { name: /Agregar Patología/ })).toBeVisible()
    await expect(page.getByLabel('Nombre de la patología')).toHaveCount(0)
    expect(preguntas).toHaveLength(1)
  })

  test('salir por la barra lateral pregunta una sola vez, y volver después no pregunta', async ({ page }) => {
    await fichaAMedias(page)
    const preguntas = contestar(page, 'aceptar')

    await page.locator('.admin-sidebar').getByRole('link', { name: 'Comentarios' }).click()
    await page.waitForURL(/\/admin-panel\/comentarios/)
    await asentarse(page)
    expect(preguntas).toHaveLength(1)

    // La ficha de antes se desmontó sin guardar: volver a ella es volver a una
    // ficha nueva en blanco, sin nada que perder por el camino.
    await page.goBack({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/patologias\/nuevo$/)
    await asentarse(page)
    expect(preguntas).toHaveLength(1)
  })
})
