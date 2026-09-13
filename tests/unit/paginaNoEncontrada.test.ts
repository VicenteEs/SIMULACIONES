import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Las tres pantallas de «no encontrado»: la pública, la del panel y la global.
 *
 * Se vigilan por el mismo motivo que las de error: borrarlas o renombrarlas no
 * rompe ninguna compilación ni ninguna otra prueba. `not-found.tsx` es una
 * convención de nombre —lo resuelve el cargador de Next por el nombre del
 * archivo, no por ninguna importación—, así que el día que desaparezca todo
 * seguirá en verde y lo único que cambiará es que las ocho llamadas a
 * `notFound()` del árbol volverán a contestar en inglés y sin salida.
 *
 * Las tres son componentes de servidor sin props, así que se pueden pintar con
 * `renderToStaticMarkup` aunque el entorno sea `node` y no haya jsdom:
 * `next/link` se resuelve a un `<a>` fuera de la aplicación.
 *
 * El reparto, que es lo que estas pruebas fijan: `notFound()` desde el panel →
 * `admin-panel/not-found.tsx`; `notFound()` desde una página pública →
 * `(frontend)/not-found.tsx`; dirección que no casa con ninguna ruta →
 * `src/app/global-not-found.tsx`.
 */

const RUTA_PUBLICA = join(process.cwd(), 'src', 'app', '(frontend)', 'not-found.tsx')
const RUTA_PANEL = join(
  process.cwd(),
  'src',
  'app',
  '(frontend)',
  'admin-panel',
  'not-found.tsx',
)
const RUTA_GLOBAL = join(process.cwd(), 'src', 'app', 'global-not-found.tsx')

const pintar = async (modulo: string): Promise<string> => {
  const cargado = await import(modulo)
  return renderToStaticMarkup(createElement(cargado.default))
}

describe('la pantalla de ficha no encontrada', () => {
  it('existe donde Next la busca', () => {
    // La ruta es la prueba entera: fuera de `(frontend)` el archivo deja de ser
    // el límite de «no encontrado» del grupo y pasa a ser un módulo suelto que
    // no llama nadie, sin que nada avise.
    expect(existsSync(RUTA_PUBLICA)).toBe(true)
  })

  it('no declara props', async () => {
    // Un `not-found.tsx` no recibe ninguna —lo dice el documento del marco en
    // `next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`—.
    // Declarar `error` o `retry` aquí no rompe la compilación: simplemente
    // llegan `undefined` en cada pintada, y lo que se cuelgue de ellas no se
    // enseña nunca.
    const cargado = await import('@/app/(frontend)/not-found')
    expect(cargado.default.length).toBe(0)
  })

  it('da dos salidas a mano', async () => {
    // Sin ellas la única salida es el botón «atrás» del navegador, que devuelve
    // exactamente al enlace roto del que se venía.
    const html = await pintar('@/app/(frontend)/not-found')
    expect(html).toContain('href="/biblioteca"')
    expect(html).toContain('href="/"')
  })

  it('no ofrece reintentar', async () => {
    // `notFound()` no es un fallo pasajero: la ficha se retiró o se borró, y
    // volver a pedirla da lo mismo. Un botón que promete otro intento sobre eso
    // manda a pulsar hasta que la persona se rinde.
    const html = await pintar('@/app/(frontend)/not-found')
    expect(html).not.toContain('Volver a intentarlo')
  })
})

describe('la pantalla de no encontrado del panel', () => {
  it('existe donde Next la busca', () => {
    // Sin ella, el `notFound()` de `contenido/[coleccion]` sube al límite de
    // `(frontend)`, que está por encima del layout del panel: el administrador
    // pierde la barra lateral y aterriza con los estilos de la parte pública.
    expect(existsSync(RUTA_PANEL)).toBe(true)
  })

  it('la salida se queda dentro del panel', async () => {
    // Quien llega aquí estaba trabajando: devolverlo a la portada pública le
    // cuesta volver a entrar al panel y a la sección donde estaba.
    const html = await pintar('@/app/(frontend)/admin-panel/not-found')
    expect(html).toContain('href="/admin-panel"')
    expect(html).toContain('href="/admin-panel/contenido"')
  })

  it('no usa las clases de la hoja pública', () => {
    // El panel tiene su propia hoja (`admin.css`) y la pública no llega hasta
    // aquí: una `.tarjeta` o un `.boton` copiados de `(frontend)` se pintarían
    // sin estilo ninguno y nadie lo vería hasta abrir un 404 del panel.
    const fuente = readFileSync(RUTA_PANEL, 'utf8')
    expect(fuente).not.toMatch(/className="(tarjeta|boton)[" ]/)
    expect(fuente).toContain('admin-btn')
  })
})

describe('la pantalla global de dirección inexistente', () => {
  it('existe donde Next la busca', () => {
    // Un `src/app/not-found.tsx` no vale aquí: se pinta dentro del layout raíz
    // y este proyecto no tiene uno solo —`(frontend)` y `(payload)` son cada
    // uno su propia raíz y no hay `src/app/layout.tsx`—. El nombre del archivo
    // es lo único que lo convierte en la pantalla global; renombrarlo no rompe
    // nada y solo devuelve la pantalla en inglés.
    expect(existsSync(RUTA_GLOBAL)).toBe(true)
  })

  it('la bandera que la enciende está puesta de verdad', () => {
    // `global-not-found` va detrás de `experimental.globalNotFound` en
    // `next.config.mjs`: apagada, Next ni busca el archivo
    // (`node_modules/next/dist/build/entries.js`) y este queda inerte sin que
    // nada avise. Es el modo de fallar más caro que tiene esta pantalla —parece
    // cubierta y no lo está—, y es el que ocurrió: la pantalla se escribió sin
    // la bandera, y esta misma prueba se conformaba con que la CABECERA del
    // archivo mencionara la palabra. La suite salía verde sobre una pantalla
    // que no se pinta nunca. Por eso ahora se lee la configuración y no un
    // comentario: lo que hay que comprobar es el interruptor, no el letrero
    // que dice dónde está el interruptor.
    const configuracion = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8')
    expect(configuracion).toMatch(/globalNotFound:\s*true/)
    const fuente = readFileSync(RUTA_GLOBAL, 'utf8')
    expect(fuente).toContain('globalNotFound')
  })

  it('pinta un documento completo', async () => {
    // Esta página se sirve saltándose el árbol de layouts, así que no hay
    // documento alrededor que aporte `<html>` y `<body>`. Sin ellos el marco
    // devuelve un fragmento suelto («this file must return a full HTML
    // document», dice `not-found.md`).
    const html = await pintar('@/app/global-not-found')
    expect(html).toMatch(/<html[\s>]/)
    expect(html).toMatch(/<body[\s>]/)
  })

  it('trae los colores en línea y no depende de la hoja global', () => {
    // La hoja de `(frontend)` no llega hasta aquí. Un `className="tarjeta"`
    // copiado de la pantalla pública saldría sin estilo ninguno, y eso solo se
    // ve tecleando una dirección inexistente a propósito.
    const fuente = readFileSync(RUTA_GLOBAL, 'utf8')
    expect(fuente).not.toMatch(/className=/)
    expect(fuente).toContain("colorScheme: 'light'")
  })

  it('la única salida pasa por ruta() y no por next/link', () => {
    // Dos cosas que se rompen a la vez y en silencio. `<Link>` navegaría por un
    // router que aquí no está montado; y una URL escrita a mano sin `ruta()`
    // sale, bajo el prefijo `/traumahub`, a la raíz del dominio, que es otra
    // página distinta detrás del mismo proxy. Las dos funcionan en desarrollo.
    const fuente = readFileSync(RUTA_GLOBAL, 'utf8')
    expect(fuente).not.toContain('next/link')
    expect(fuente).toContain("href={ruta('/')}")
    expect(fuente).not.toMatch(/href="\//)
  })

  it('no se indexa', () => {
    // El acceso es cerrado (D-020) y esta página no hereda el `metadata` del
    // layout de `(frontend)`, porque se pinta fuera de él.
    const fuente = readFileSync(RUTA_GLOBAL, 'utf8')
    expect(fuente).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/)
  })

  it('no declara props', async () => {
    // `global-not-found.js` tampoco recibe ninguna, igual que `not-found.js`
    // (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`).
    const cargado = await import('@/app/global-not-found')
    expect(cargado.default.length).toBe(0)
  })
})
