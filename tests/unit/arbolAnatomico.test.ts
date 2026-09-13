import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia del árbol anatómico, `src/components/atlas/ArbolAnatomico.tsx`.
 *
 * Se lee el archivo como texto, igual que en `visorAtlas.test.ts` y
 * `tallerDeAtlas.test.ts`, y por la misma razón: el entorno de estas pruebas es
 * `node` y el proyecto no tiene jsdom ni biblioteca de componentes (ver el
 * comentario de `vitest.config.ts`), así que aquí no hay manera de montar el
 * árbol ni de pasar un ratón por encima de una fila.
 *
 * Lo que se vigila es el rendimiento del gesto más repetido del taller, porque
 * no avisa de ninguna manera cuando se rompe: nada falla, nada se pinta mal, el
 * árbol solo se vuelve pastoso. Pasar el ratón por una fila cambia `resaltada`
 * en el taller, y eso repinta este árbol entero; con las 2.234 piezas del atlas
 * delante, cada fila que el ratón cruza rehacía todas las demás y volvía a
 * recorrer el catálogo para recontar lo encendido.
 *
 * Las tres piezas del arreglo se sostienen entre sí, y por eso se prueban
 * juntas: el `memo` no sirve de nada si las devoluciones de llamada nacen
 * nuevas en cada pintado, y los recuentos no sirven de nada si se rehacen al
 * pintar. Quien deshaga cualquiera de las tres —cerrar de vuelta las funciones
 * sobre el identificador es la tentación obvia, porque queda más corto— no verá
 * ningún error.
 */

const ARBOL = join(process.cwd(), 'src', 'components', 'atlas', 'ArbolAnatomico.tsx')
// Los finales de línea se normalizan al leer: en Windows el árbol se saca con
// CRLF y los patrones de varias líneas no casaban contra esa copia.
const fuente = readFileSync(ARBOL, 'utf8').replace(/\r\n/g, '\n')

describe('el árbol anatómico cuando el ratón recorre la lista', () => {
  it('memoriza la fila de cada pieza', () => {
    expect(fuente).toMatch(/const FilaDePieza = memo\(/)
    expect(fuente).toContain("import { memo, useCallback, useMemo, useState } from 'react'")
  })

  it('pasa a la fila devoluciones de llamada estables, no cerradas sobre la pieza', () => {
    // Una función nueva en cada pintado desmemoriza la fila entera: `memo`
    // compara las props una a una y esa nunca coincide.
    expect(fuente).toContain('alAlternar={alternarPieza}')
    expect(fuente).toContain('alSoloEsto={soloEstaPieza}')
    expect(fuente).not.toMatch(/alAlternar=\{\(\)/)
    expect(fuente).not.toMatch(/alSoloEsto=\{\(\)/)

    // Y por eso reciben el identificador como argumento.
    expect(fuente).toContain('alAlternar: (id: string) => void')
    expect(fuente).toContain('alSoloEsto: (id: string) => void')
  })

  it('declara esas dos con `useCallback`', () => {
    // `alternarPieza` depende de `visibles` a propósito: cuando la selección
    // cambia, las filas tienen que repintarse igualmente porque su casilla
    // cambia. Lo que no puede es cambiar con el resaltado.
    expect(fuente).toMatch(/const alternarPieza = useCallback\(/)
    expect(fuente).toMatch(/const soloEstaPieza = useCallback\(/)
    expect(fuente).toContain('[visibles, alCambiarVisibles],')
  })

  it('memoriza los recuentos de cada grupo y de cada rama sobre `visibles`', () => {
    // Recorren las 2.234 piezas. Calculados al pintar, se rehacían en cada paso
    // del ratón por la lista, que es cuando nada de esto ha cambiado.
    expect(fuente).toMatch(/const cuentas = useMemo\(/)
    expect(fuente).toContain('[arbol, visibles],')
    // La forma antigua: el recuento hecho dentro del `map` del pintado.
    expect(fuente).not.toContain('grupo.ramas.flatMap((r) => r.piezas.map((p) => p.id))')
    expect(fuente).not.toContain('.filter((id) => visibles.has(id)).length')
  })
})
