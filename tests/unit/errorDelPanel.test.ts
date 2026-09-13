import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * La red de seguridad del panel: `src/app/(frontend)/admin-panel/error.tsx`.
 *
 * Es el tercero de los tres límites de error del árbol, y el único que conserva
 * la barra lateral. Sin él, el fallo de cualquier página del panel sube a
 * `(frontend)/error.tsx`, que está por encima del layout de `admin-panel` y por
 * tanto se lo lleva por delante: el administrador acaba en una pantalla pública
 * cuya única salida ofrecida es «Ir a la portada», es decir, salir del panel
 * justo cuando lo que quiere es mirar qué se rompió.
 *
 * Como en las otras dos, borrarlo no rompe ninguna compilación ni ninguna otra
 * prueba —es una convención de nombre— y el único síntoma sería una pantalla
 * peor el día que algo falle.
 */

const RUTA = join(process.cwd(), 'src', 'app', '(frontend)', 'admin-panel', 'error.tsx')
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
  const modulo = await import('@/app/(frontend)/admin-panel/error')
  const fallo = Object.assign(new Error('falta la tabla'), digest ? { digest } : {})
  return renderToStaticMarkup(createElement(modulo.default, { error: fallo, retry: () => {} }))
}

describe('la pantalla de fallo del panel', () => {
  it('es un componente de cliente', () => {
    // Un `error.tsx` sin la directiva no es un límite de error: Next lo rechaza
    // al compilar. Se comprueba aquí para que el fallo salga en dos segundos y
    // con su motivo, y no al final de un `npm run build`.
    expect(codigo.trimStart().startsWith("'use client'")).toBe(true)
  })

  it('el botón vuelve a pedir la página al servidor, no solo la repinta', () => {
    // `retry` y `reset` son dos props distintas que Next entrega a la vez: la
    // primera vuelve a pedir el contenido y la segunda se limita a repintar lo
    // que ya hay en el cliente. Aquí lo que falla es siempre una consulta, así
    // que con `reset` el botón devolvería esta misma pantalla. Compila igual y
    // se ve igual: por eso se fija.
    expect(codigo).toMatch(/\bretry\b/)
    expect(codigo).not.toMatch(/\breset\b/)
  })

  it('la salida no echa del panel', async () => {
    // El defecto que este archivo existe para arreglar: la pantalla que había
    // antes solo ofrecía «Ir a la portada».
    const html = await pintar()
    expect(html).toContain('href="/admin-panel"')
    expect(html).not.toMatch(/href="\/"/)
  })

  it('usa la hoja del panel y no la pública', () => {
    // `admin.css` es la que llega hasta aquí. Un `.tarjeta` o un `.boton`
    // copiados de `(frontend)/error.tsx` se pintarían sin estilo ninguno, y eso
    // solo se ve abriendo un fallo del panel a propósito.
    expect(codigo).toContain('admin-btn')
    expect(codigo).not.toMatch(/className="(tarjeta|boton)[" ]/)
  })

  it('enseña el código del fallo cuando lo hay', async () => {
    // Es lo único que cruza del servidor al navegador: en producción Next
    // sustituye el mensaje por uno genérico para no filtrar detalles, y sin el
    // `digest` nadie puede encontrar ese fallo en el registro del servidor.
    expect(await pintar('c0ffee42')).toContain('c0ffee42')
  })

  it('no promete un código cuando no lo hay', async () => {
    // Un fallo del propio cliente llega sin `digest`. Pedir un código que no
    // existe es mandar a buscar lo que no se va a encontrar.
    expect(await pintar()).not.toContain('bajo el código')
  })
})
