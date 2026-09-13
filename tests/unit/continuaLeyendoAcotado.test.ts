import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Que «Continúa leyendo» pida sus tres fichas entre las que la cuenta puede ver.
 *
 * La sección pide tres filas de `actividad` sin terminar y luego resuelve el
 * título de cada una con `findByID` y `overrideAccess: false`. Ese `findByID` es
 * el que recorta por visibilidad, y recorta tarde: ante un módulo que la cuenta
 * no tiene, `lecturaDeModulo` devuelve `false` y Payload no contesta con nada
 * sino que lanza `Forbidden` —lo explica la propia portada—, de modo que el
 * `catch` del bucle descarta la fila en silencio. Con la consulta sin acotar,
 * las tres plazas se las llevan filas invisibles: la sección sale con dos
 * tarjetas, con una o sin ninguna mientras el residente tiene lecturas a medias
 * en los módulos que sí ve. Y no falla nada al hacerlo: una sección corta parece
 * simplemente una sección con poco.
 *
 * Es el mismo defecto que ya se arregló en la mitad de al lado —el conteo de
 * `leidas`— y se sostiene aquí aparte porque las dos consultas viven en el mismo
 * `Promise.all` y es fácil tocar una y dejarse la otra, que es exactamente lo
 * que pasó.
 *
 * Se mira en el disco porque la portada es un componente de servidor y no hay
 * prueba que la ejecute.
 */

const PORTADA = readFileSync(
  join(process.cwd(), 'src', 'app', '(frontend)', 'page.tsx'),
  'utf8',
)

/**
 * Las dos consultas a `actividad` de la portada, y solo ellas.
 *
 * Buscar en el archivo entero daría por buena la acotación de una de las dos
 * aunque la otra siguiera sin ella, que es el caso que esta prueba existe para
 * cazar.
 */
function bloqueDeActividad(): string {
  const inicio = PORTADA.indexOf('const [actividad, leidas] = await Promise.all([')
  if (inicio === -1) return ''
  return PORTADA.slice(inicio, PORTADA.indexOf('\n  ])', inicio))
}

/** La primera de las dos: la de las tres fichas para retomar. */
function consultaDeContinuarLeyendo(): string {
  const bloque = bloqueDeActividad()
  const segunda = bloque.indexOf(`collection: 'actividad'`, bloque.indexOf(`collection: 'actividad'`) + 1)
  return segunda === -1 ? bloque : bloque.slice(0, segunda)
}

describe('la portada pide lo que va a poder enseñar', () => {
  it('sigue habiendo dos consultas a actividad, y se encuentran', () => {
    const bloque = bloqueDeActividad()
    expect(bloque, 'no se encontró el Promise.all de actividad en la portada').not.toBe('')
    expect(bloque.split(`collection: 'actividad'`)).toHaveLength(3)
  })

  it('las dos se acotan a los módulos visibles', () => {
    // `coleccionesVisibles` sale de `modulosVisibles`, que es la misma lista con
    // la que se cuentan las fichas y se pinta la rejilla. Si una de las dos
    // consultas deja de mirarla, vuelve a haber dos mitades hablando de
    // conjuntos distintos.
    expect(bloqueDeActividad().split('coleccion: { in: coleccionesVisibles }')).toHaveLength(3)
  })

  it('«Continúa leyendo» es una de las dos acotadas, y pide tres', () => {
    const consulta = consultaDeContinuarLeyendo()
    expect(consulta).toContain('limit: 3')
    expect(consulta).toContain(`completado: { equals: false }`)
    expect(consulta).toContain('coleccion: { in: coleccionesVisibles }')
  })

  it('ninguna de las dos pregunta con la lista vacía', () => {
    // Un `in: []` es una condición que no dice nada y cada adaptador la traduce
    // a lo suyo. La cuenta sin módulos no tiene nada que retomar ni nada leído,
    // así que se contesta sin ir a PostgreSQL.
    expect(bloqueDeActividad().split('coleccionesVisibles.length === 0')).toHaveLength(3)
  })

  it('la lista está declarada antes del Promise.all', () => {
    const declaracion = PORTADA.indexOf('const coleccionesVisibles = modulosVisibles.map')
    expect(declaracion).toBeGreaterThan(-1)
    expect(declaracion).toBeLessThan(PORTADA.indexOf('const [actividad, leidas]'))
  })

  it('el bucle que resuelve los títulos sigue comprobando el acceso', () => {
    // Acotar la consulta no sustituye a esta comprobación: quien crea las filas
    // de `actividad` es `POST /api/actividad`, que acepta cualquier `coleccion`
    // y cualquier `documentoId`. Sin `overrideAccess: false` la sección vuelve a
    // ser un listador de títulos de borradores probando identificadores.
    const bucle = PORTADA.slice(
      PORTADA.indexOf('for (const registro of actividad.docs'),
      PORTADA.indexOf('const totalFichas'),
    )
    expect(bucle).toContain('overrideAccess: false')
    expect(bucle).toContain('user: usuarioEfectivo as never')
  })
})
