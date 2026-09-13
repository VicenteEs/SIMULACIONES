import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * La red de último recurso: `src/app/global-error.tsx`.
 *
 * Es la única que alcanza al layout raíz, y por tanto la única que tapa el
 * fallo más probable de todos: `(frontend)/layout.tsx` llama a `obtenerSesion()`
 * en cada petición y eso consulta la base, así que con Postgres caído el error
 * sale del layout y `(frontend)/error.tsx` ni se entera.
 *
 * Lo que se vigila aquí es que el archivo siga existiendo y que se baste solo.
 * Borrarlo o renombrarlo no rompe ninguna compilación ni ninguna otra prueba:
 * simplemente vuelve la pantalla genérica de Next —en inglés— el día que la
 * base no responda, que es el día en que menos falta hace tener que adivinar
 * nada.
 */

const RUTA = join(process.cwd(), 'src', 'app', 'global-error.tsx')
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
  const modulo = await import('@/app/global-error')
  const fallo = Object.assign(new Error('la base no responde'), digest ? { digest } : {})
  return renderToStaticMarkup(createElement(modulo.default, { error: fallo, retry: () => {} }))
}

describe('la pantalla de fallo general', () => {
  it('es un componente de cliente', () => {
    // Un límite de error sin la directiva no es un límite de error: Next lo
    // rechaza al compilar. Se comprueba aquí para que el fallo salga en dos
    // segundos y con su motivo, y no al final de un `npm run build`.
    expect(codigo.trimStart().startsWith("'use client'")).toBe(true)
  })

  it('pinta su propio documento', async () => {
    // Cuando esto entra, sustituye al layout raíz: no hay `<html>` ni `<body>`
    // alrededor que lo envuelva. Sin ponerlos aquí, el navegador recibe un
    // fragmento suelto y la pantalla de fallo falla ella también, que es el
    // peor sitio donde dejar un fallo.
    const html = await pintar()
    expect(html).toMatch(/<html[^>]*lang="es"/)
    expect(html).toContain('<body')
  })

  it('el botón vuelve a pedir la página al servidor, no solo la repinta', () => {
    // Mismo motivo que en `(frontend)/error.tsx`: `reset` repinta lo que ya hay
    // en el cliente, y lo que hay aquí es un layout que reventó al consultar la
    // base. Compila igual y se ve igual: por eso se fija.
    expect(codigo).toMatch(/\bretry\b/)
    expect(codigo).not.toMatch(/\breset\b/)
  })

  it('la salida a mano pasa por ruta()', () => {
    // Es un `<a>` escrito a mano, y Next no le pone el prefijo: bajo
    // `/traumahub` un `href="/"` a pelo sale a la raíz del dominio, que es otra
    // página distinta detrás del mismo proxy. En desarrollo se vería bien, que
    // es lo que hace que este olvido llegue al servidor.
    expect(codigo).toMatch(/href=\{ruta\(/)
    expect(codigo).not.toMatch(/href="\//)
  })

  it('se lleva los colores puestos', async () => {
    // La hoja de estilos del grupo no llega hasta aquí —la documentación del
    // marco lo dice: `global-error` «renders their own document and do not
    // include your global styles»—, y además esta pantalla se pinta justo
    // cuando algo gordo se ha roto, que no es momento de depender de que cargue
    // un recurso aparte. Si alguien cambia los estilos en línea por clases, la
    // pantalla sale en blanco y negro sin avisar; esto avisa.
    const html = await pintar()
    expect(html).toContain('#eef1f7')
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
