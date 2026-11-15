import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/app/(frontend)/acciones/resolucionDeReferencia', () => ({ grabarResolucionDeReferencia: vi.fn() }))

import { GrabarReferencia } from '@/components/simulador/GrabarReferencia'

/**
 * «Guardar como resolución de referencia» al terminar un caso (D-373).
 *
 * Sin jsdom no se pulsa: se pinta el botón y se mira el cable que lo lleva
 * desde la página hasta el cierre de la consola. Lo que importa del cable es a
 * quién se le ofrece: a quien edita el simulador, con su rol real, y nunca en la
 * vista previa ni en el ensayo del editor.
 */

const pintar = (notaCompleta: boolean) =>
  renderToStaticMarkup(
    createElement(GrabarReferencia, { documentoId: '7', notaCompleta, recorrido: () => ({ v: 1 as const, pasos: [] }) }),
  )
const fuente = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

describe('el botón', () => {
  it('se ofrece sin más con la nota máxima', () => {
    const html = pintar(true)
    expect(html).toMatch(/Guardar como resolución de referencia/)
    expect(html).not.toMatch(/no tiene la nota máxima/)
  })

  it('con menos de la máxima, lo dice antes de pulsar', () => {
    expect(pintar(false)).toMatch(/Este recorrido no tiene la nota máxima/)
  })
})

describe('el cable', () => {
  it('la consola lo pinta solo con el permiso y fuera del ensayo del editor, con la partida en el recorrido', () => {
    const consola = fuente('src/components/simulador/ConsolaQuirurgica.tsx')
    const i = consola.indexOf('<GrabarReferencia')
    expect(i).toBeGreaterThan(-1)
    expect(consola.slice(i - 80, i)).toMatch(/puedeGrabarLaReferencia && !editor \? \(\s*$/)
    // El mismo recorrido que `guardarRecorrido` manda al servidor: sin la partida, los pasos sin nada que reducir
    // contarían distinto en el ensayo que en la consola.
    expect(consola.slice(i, i + 600)).toMatch(/recorridoDeLaNota\.current[\s\S]*partidaDeLaReduccion/)
    expect(consola).toMatch(/puedeGrabarLaReferencia = false,/)
  })

  it('el envoltorio lo pasa y la página lo decide con el rol real, sin vista previa', () => {
    expect(fuente('src/components/simulador/CasoConSuLectura.tsx')).toMatch(
      /puedeGrabarLaReferencia=\{puedeGrabarLaReferencia\}/,
    )
    const pagina = fuente('src/app/(frontend)/simulador/[id]/page.tsx')
    expect(pagina).toMatch(
      /puedeGrabarLaReferencia=\{\s*!simulando && !!usuario && \(rolReal === 'admin' \|\| rolReal === 'editor'\) && puedeEditar\(usuario, 'cirugias'\)\s*\}/,
    )
  })
})
