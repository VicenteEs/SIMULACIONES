import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * «Terminar» y la radiografía postoperatoria (P-013, pedido 2 de Cristóbal): «no supe dónde poner "terminar" para que me
 * pudiera dar la opción de tomar la Rx postoperatoria».
 *
 * Tres caminos cerrados: el final solo llegaba al aprobar el último paso; con la columna derecha plegada, el final no se
 * veía; y «Omitir» la radiografía era para siempre. Son cableado de la consola, y se prueban sobre el código.
 */

const consola = readFileSync(join(process.cwd(), 'src/components/simulador/ConsolaQuirurgica.tsx'), 'utf8')
const css = readFileSync(join(process.cwd(), 'src/app/(frontend)/simulador/consola.css'), 'utf8')
const guia = readFileSync(join(process.cwd(), 'src/components/simulador/GuiaDeLaConsola.tsx'), 'utf8')
const entre = (desde: string, hasta: string) => {
  const i = consola.indexOf(desde)
  return consola.slice(i, consola.indexOf(hasta, i + desde.length))
}

describe('«Terminar la cirugía» (P-013, pedido 2)', () => {
  it('está en la barra, al lado de «Reiniciar», mientras el caso no haya terminado y fuera del editor', () => {
    const barra = entre('{!terminado && !editor ? (', '</header>')
    expect(barra).toContain('onClick={() => void terminarLaCirugia()}')
    expect(barra).toContain('Terminar la cirugía')
    expect(barra.indexOf('terminarLaCirugia')).toBeLessThan(barra.indexOf('void reiniciar()'))
  })

  it('pregunta contando lo que queda sin puntos, y lleva al final por el mismo camino que el último paso', () => {
    const terminar = entre('async function terminarLaCirugia() {', 'async function reiniciar() {')
    expect(terminar).toContain("titulo: '¿Terminar la cirugía?'")
    expect(terminar).toContain('Quedan ${faltan} pasos sin hacer, y no sumarán puntos.')
    expect(terminar).toContain('Después podrá tomar la radiografía postoperatoria.')
    // Lo que pide el final: la lectura, la cuenta guardada, el índice de después del último y los relojes parados.
    expect(terminar).toContain('marcarCasoComoLeido()')
    expect(terminar).toContain('guardarRecorrido(puntaje, complicaciones, insumos)')
    expect(terminar).toContain('setIndice(final)')
    expect(terminar).toContain('entrarEnPaso(final, capasApagadas)')
    expect(terminar).toContain('empezarElPaso(final, {')
    expect(terminar).toContain("setRadiografiaPost('invitacion')")
    // Repasando no se puntúa: ni se guarda ni se marca.
    expect(terminar.indexOf('if (!repaso) {')).toBeLessThan(terminar.indexOf('marcarCasoComoLeido()'))
  })

  it('al terminar, por cualquiera de los dos caminos, la columna derecha se despliega', () => {
    expect(entre('async function terminarLaCirugia() {', 'async function reiniciar() {')).toContain('plegarElPaso(false)')
    expect(entre('const siguiente = indice + 1', 'setIndice(siguiente)')).toContain('if (siguiente >= caso.pasos.length) plegarElPaso(false)')
  })

  it('omitida la radiografía, se puede volver a pedir desde el final', () => {
    const omitida = entre("{radiografiaPost === 'omitida' && !editor ? (", ') : null}')
    expect(omitida).toContain("setRadiografiaPost('abierta')")
    expect(omitida).toContain('Tomar la radiografía postoperatoria')
  })

  it('en el móvil va en su propia fila y no encima de «Reiniciar»', () => {
    expect(css).toContain('.consola-terminar { grid-column: 1 / -1;')
    expect(css).toContain('.consola-terminar:hover { color: var(--c-acento);')
  })

  it('la guía de la consola lo cuenta', () => {
    expect(guia).toContain("titulo: 'Terminar y radiografía'")
    expect(guia).toContain('«Terminar la cirugía»')
  })
})
