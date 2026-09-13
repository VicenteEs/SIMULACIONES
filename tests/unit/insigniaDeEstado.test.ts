import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Que las dos pantallas que enseñan el estado lo compongan con la misma pieza.
 *
 * `estadoEnPalabras` concuerda la insignia con `esquema.genero` y su resultado
 * ya está probado en `esquema.test.ts`. Lo que falta —y es justo lo que dejó
 * pasar la vez anterior— es que alguien la llame: el ayudante se escribió, las
 * pruebas pasaron verdes y las dos pantallas siguieron con su literal en
 * femenino fijo, «✓ Publicada» encima de «Modelo 3D» y de «Hueso». Un ayudante
 * sin consumidores no arregla nada, y nada avisa de ello.
 *
 * El entorno de la suite es `node` y no hay jsdom ni biblioteca de componentes
 * (ver `vitest.config.ts`), así que aquí no se pinta: se lee el archivo, como
 * en `tablaDocumentos.test.ts`.
 */

const RAIZ = process.cwd()
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const EDITOR = fuente('src', 'components', 'admin', 'FormularioDocumento.tsx')
const TABLA = fuente('src', 'components', 'admin', 'TablaDocumentos.tsx')

/**
 * El literal tal como estaba escrito en el JSX, con sus comillas.
 *
 * Con comillas y no suelto a propósito: los comentarios de los dos archivos
 * cuentan el defecto nombrándolo —«✓ Publicada» encima de «Modelo 3D»—, y
 * buscarlo sin ellas encontraría esa explicación y daría por rota una pantalla
 * que está bien.
 */
const LITERAL_EN_FEMENINO = "'✓ Publicada'"

/** La trae del esquema, que es donde vive la única versión de la frase. */
const IMPORTA_EL_AYUDANTE = /import \{[^}]*\bestadoEnPalabras\b[^}]*\} from '@\/admin\/esquema'/

describe('la insignia de estado sale de `estadoEnPalabras` en las dos pantallas', () => {
  it('el editor la compone con el esquema y no la escribe a mano', () => {
    expect(EDITOR).toMatch(IMPORTA_EL_AYUDANTE)
    expect(EDITOR).toContain('estadoEnPalabras(esquema, publicado)')
    expect(EDITOR).not.toContain(LITERAL_EN_FEMENINO)
  })

  it('el listado también, y por eso `celda` recibe el esquema entero', () => {
    expect(TABLA).toMatch(IMPORTA_EL_AYUDANTE)
    expect(TABLA).toContain('estadoEnPalabras(esquema, publicado)')
    expect(TABLA).not.toContain(LITERAL_EN_FEMENINO)
    // `celda` es función de módulo: sin el esquema no tiene de dónde sacar el
    // género, y esa fue la razón por la que esta mitad se quedó sin arreglar
    // mientras la otra ya tenía a mano el `esquema` de sus props.
    expect(TABLA).toMatch(/function celda\([^)]*esquema: EsquemaDeColeccion\)/)
    expect(
      TABLA.match(/celda\(fila\.valores\[columna\.nombre\], columna\.formato, esquema\)/g) ?? [],
    ).toHaveLength(2)
  })

  it('el género se lee del esquema y no se decide en la pantalla', () => {
    // Si volviera a decidirse aquí, volveríamos a tener dos frases para el
    // mismo estado: la del editor y la del listado, arregladas por separado.
    for (const [nombre, archivo] of [
      ['el editor', EDITOR],
      ['el listado', TABLA],
    ] as const) {
      expect(archivo, nombre).not.toMatch(/genero === '[mf]'/)
    }
  })
})
