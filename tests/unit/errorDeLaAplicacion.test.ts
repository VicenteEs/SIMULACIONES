import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * La red de seguridad de la parte pública: `src/app/(frontend)/error.tsx`.
 *
 * Lo que se vigila aquí no es el aspecto de la pantalla, es que siga estando y
 * que el botón haga lo que dice. Un `error.tsx` borrado o renombrado no rompe
 * ninguna compilación ni ninguna otra prueba: simplemente vuelve la pantalla
 * genérica de Next —en inglés, sin barra, sin vuelta— y nadie se entera hasta
 * que un residente se la encuentra un día que la base va lenta.
 *
 * El componente sí se puede pintar aunque el entorno sea `node` y no haya
 * jsdom, porque `renderToStaticMarkup` no necesita DOM y `next/link` se
 * resuelve a un `<a>` fuera de la aplicación. Lo que no se puede es pulsar el
 * botón, así que la parte de `retry` se comprueba sobre el código.
 */

const RUTA = join(process.cwd(), 'src', 'app', '(frontend)', 'error.tsx')
const fuente = readFileSync(RUTA, 'utf8')

/**
 * El archivo sin comentarios. Los de esta casa citan el código que explican
 * —el de aquí nombra a `reset` para decir por qué no se usa—, así que sin
 * quitarlos la prueba del `retry` se cumpliría sola y al revés.
 */
const codigo = fuente
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const pintar = async (digest?: string): Promise<string> => {
  const modulo = await import('@/app/(frontend)/error')
  const fallo = Object.assign(new Error('se cayó la base'), digest ? { digest } : {})
  return renderToStaticMarkup(createElement(modulo.default, { error: fallo, retry: () => {} }))
}

describe('la pantalla de fallo de la plataforma', () => {
  it('es un componente de cliente', () => {
    // Un `error.tsx` sin la directiva no es un límite de error: Next lo rechaza
    // al compilar. Se comprueba aquí para que el fallo salga en dos segundos y
    // con su motivo, y no al final de un `npm run build`.
    expect(codigo.trimStart().startsWith("'use client'")).toBe(true)
  })

  it('el botón vuelve a pedir la página al servidor, no solo la repinta', () => {
    // `retry` y `reset` son dos props distintas que Next entrega a la vez
    // (`next/dist/client/components/error-boundary.js`): `retry` vuelve a pedir
    // el contenido y `reset` se limita a repintar lo que ya hay en el cliente.
    // Aquí lo que falla es casi siempre una consulta, así que con `reset` el
    // botón «Volver a intentarlo» devolvería la misma pantalla de error sin
    // haber intentado nada. Compila igual y se ve igual: por eso se fija.
    expect(codigo).toMatch(/\bretry\b/)
    expect(codigo).not.toMatch(/\breset\b/)
  })

  it('da una salida a mano además del reintento', async () => {
    // Si el fallo es permanente —una ficha que quedó rota— el reintento no
    // sirve, y sin este enlace la única salida es el botón «atrás».
    const html = await pintar()
    expect(html).toContain('href="/"')
  })

  it('enseña el código del fallo cuando lo hay', async () => {
    // Es lo único que cruza del servidor al navegador: en producción Next
    // sustituye el mensaje por uno genérico para no filtrar detalles, y sin el
    // `digest` nadie puede encontrar ese fallo en el registro del servidor.
    expect(await pintar('c0ffee42')).toContain('c0ffee42')
  })

  it('no promete un código cuando no lo hay', async () => {
    // Un fallo del propio cliente llega sin `digest`. Pedirle a alguien que dé
    // un código que no existe es mandarlo a buscar lo que no va a encontrar.
    expect(await pintar()).not.toContain('equipo docente')
  })
})
