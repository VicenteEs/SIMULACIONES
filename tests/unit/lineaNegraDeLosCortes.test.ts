import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * La línea negra de los cortes (P-008 E1). Lo que se mide aquí es cableado entre módulos que no se montan sin
 * navegador: la oclusión ambiental del pabellón y la recta provisional del lienzo. Lo de la herida misma —la cinta
 * que se aparta con un instrumento dentro— se prueba con mallas de verdad en `heridasEnLaEscena` y
 * `separadorEnElLabio`.
 */

const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n')
const PABELLON = leer('src/components/simulador/pabellon.ts')
const LIENZO = leer('src/components/simulador/LienzoQuirurgico.tsx')

describe('la oclusión ambiental no cuenta la cinta de la herida', () => {
  it('reconoce lo que es interfaz igual que el resto del lienzo, también por el nombre de la cinta', () => {
    // Con solo `userData.deInterfaz` la cinta entraba en el cálculo sin normales y el velo la dejaba casi negra.
    expect(PABELLON).toContain("import { esDeInterfazDelModelo } from './nodosDelModelo'")
    expect(PABELLON).toContain('if (esDeInterfazDelModelo(o) || transparente) {')
    expect(PABELLON).not.toContain('o.userData.deInterfaz === true || transparente')
  })
})

describe('cancelar una recta borra también la línea provisional', () => {
  const cuerpo = LIENZO.slice(LIENZO.indexOf('function cancelarLaRecta(t: Taller) {'))
  const cancelar = cuerpo.slice(0, cuerpo.indexOf('\n}\n') + 2)

  it('vacía el trazo, lo vuelve a dibujar (sin puntos lo quita) y avisa a la consola', () => {
    expect(cancelar).toContain('t.puntosDelTrazo = []')
    expect(cancelar).toContain('dibujarTrazo(t)')
    expect(cancelar).toContain('t.alBorrarElTrazo?.()')
    // Solo con una recta empezada: el trazo de una incisión ya hecha no se toca.
    expect(cancelar.indexOf('if (t.inicioDeLaRecta) {')).toBeLessThan(cancelar.indexOf('t.puntosDelTrazo = []'))
  })

  it('la consola deja de contar el largo de lo que se borró', () => {
    expect(LIENZO).toContain('taller.current.alBorrarElTrazo = () => ultimas.current.alTrazar?.([])')
  })
})
