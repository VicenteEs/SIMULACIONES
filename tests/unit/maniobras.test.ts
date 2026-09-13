import { describe, it, expect } from 'vitest'
import {
  agruparManiobrasPorSegmento,
  idDelSegmento,
  TITULO_SIN_SEGMENTO,
} from '@/lib/maniobras'

/**
 * El reparto de maniobras en grupos, que en este módulo decide qué se puede
 * leer.
 *
 * En los otros cuatro módulos, una ficha que el listado no pinta sigue teniendo
 * su página y su casilla de «leída». El examen físico no tiene página por
 * documento: el listado es la única pantalla que existe, así que una maniobra
 * que no entra en ningún grupo no se puede abrir, ni comentar, ni marcar, y
 * mientras tanto cuenta en el total de la portada. Es un suelo de uno en la
 * cifra «por leer» que no se explica por nada visible en pantalla.
 *
 * Por eso lo que se comprueba aquí, antes que el orden o los títulos, es que
 * las maniobras que entran sean exactamente las que salen.
 */

/** Un segmento poblado, como lo devuelve Payload con `depth: 1`. */
const segmento = (id: number, nombre: string) => ({ id, nombre })

/** Una maniobra con su segmento como referencia, como viene con `depth: 0`. */
const maniobra = (id: number, referencia: unknown) => ({ id, segmento: referencia })

const HOMBRO = segmento(1, 'Hombro')
const RODILLA = segmento(2, 'Rodilla')

/** Todas las maniobras de todos los grupos, en orden. */
const repartidas = <M extends { id: number | string }>(
  grupos: { lista: M[] }[],
): (number | string)[] => grupos.flatMap((g) => g.lista.map((m) => m.id))

describe('agruparManiobrasPorSegmento no pierde ninguna maniobra', () => {
  it('las que tienen segmento van en el suyo', () => {
    const grupos = agruparManiobrasPorSegmento(
      [maniobra(10, 1), maniobra(11, 2), maniobra(12, 1)],
      [HOMBRO, RODILLA],
    )

    expect(grupos.map((g) => g.titulo)).toEqual(['Hombro', 'Rodilla'])
    expect(repartidas(grupos)).toEqual([10, 12, 11])
  })

  it('la que se quedó sin segmento sale igual, en su propio grupo', () => {
    // Esta es la que desaparecía: el JSX recorría los segmentos y filtraba
    // dentro, así que una maniobra con el segmento vacío no entraba en ninguna
    // vuelta del bucle y no se pintaba en ninguna parte.
    const grupos = agruparManiobrasPorSegmento(
      [maniobra(10, 1), maniobra(99, null)],
      [HOMBRO],
    )

    expect(repartidas(grupos)).toEqual([10, 99])
    expect(grupos[grupos.length - 1].titulo).toBe(TITULO_SIN_SEGMENTO)
  })

  it('la que apunta a un segmento que no se cargó tampoco se pierde', () => {
    // El listado pide 100 segmentos y 300 maniobras: una maniobra puede apuntar
    // a un segmento borrado, o al 101.º, y el resultado en pantalla era el
    // mismo que el del segmento vacío.
    const grupos = agruparManiobrasPorSegmento(
      [maniobra(10, 1), maniobra(77, 404)],
      [HOMBRO, RODILLA],
    )

    expect(repartidas(grupos)).toEqual([10, 77])
    expect(grupos[grupos.length - 1].lista.map((m) => m.id)).toEqual([77])
  })

  it('cada maniobra sale una sola vez, tenga o no segmento', () => {
    const entrada = [
      maniobra(1, 1),
      maniobra(2, 2),
      maniobra(3, null),
      maniobra(4, undefined),
      maniobra(5, ''),
      maniobra(6, 404),
    ]
    const grupos = agruparManiobrasPorSegmento(entrada, [HOMBRO, RODILLA])

    const salida = repartidas(grupos)
    expect([...salida].sort()).toEqual(entrada.map((m) => m.id).sort())
    expect(new Set(salida).size).toBe(entrada.length)
  })

  it('acepta el segmento poblado y la referencia suelta por igual', () => {
    // Con `depth: 1` Payload devuelve el objeto; con `depth: 0`, el número.
    // Bajar la profundidad del listado no puede vaciar los grupos.
    const grupos = agruparManiobrasPorSegmento(
      [maniobra(10, { id: 1, nombre: 'Hombro' }), maniobra(11, 1)],
      [HOMBRO],
    )

    expect(grupos).toHaveLength(1)
    expect(repartidas(grupos)).toEqual([10, 11])
  })
})

describe('agruparManiobrasPorSegmento titula lo que devuelve', () => {
  it('no devuelve el grupo del segmento sin maniobras publicadas', () => {
    // Un encabezado con nada debajo: el residente lo lee como contenido que se
    // perdió al cargar.
    const grupos = agruparManiobrasPorSegmento([maniobra(10, 1)], [HOMBRO, RODILLA])
    expect(grupos.map((g) => g.titulo)).toEqual(['Hombro'])
  })

  it('no inventa el grupo de sueltas cuando no hay ninguna', () => {
    const grupos = agruparManiobrasPorSegmento([maniobra(10, 1)], [HOMBRO])
    expect(grupos.map((g) => g.titulo)).not.toContain(TITULO_SIN_SEGMENTO)
  })

  it('sin maniobras no hay grupos', () => {
    expect(agruparManiobrasPorSegmento([], [HOMBRO, RODILLA])).toEqual([])
  })

  it('un segmento sin nombre no encabeza la sección con «undefined»', () => {
    const grupos = agruparManiobrasPorSegmento([maniobra(10, 5)], [{ id: 5 }])
    expect(grupos[0].titulo).not.toContain('undefined')
    expect(grupos[0].titulo).toContain('5')
  })

  it('las claves de los grupos no se repiten', () => {
    // Son el `key` de React: repetidas, dos secciones se pisan al repintar.
    const grupos = agruparManiobrasPorSegmento(
      [maniobra(10, 1), maniobra(11, 2), maniobra(12, null)],
      [HOMBRO, RODILLA],
    )
    expect(new Set(grupos.map((g) => g.clave)).size).toBe(grupos.length)
  })
})

describe('idDelSegmento distingue «no tiene» de «no coincide»', () => {
  it('devuelve null cuando no hay segmento que valga', () => {
    expect(idDelSegmento({ id: 1, segmento: null })).toBeNull()
    expect(idDelSegmento({ id: 1 })).toBeNull()
    expect(idDelSegmento({ id: 1, segmento: '' })).toBeNull()
    expect(idDelSegmento({ id: 1, segmento: {} })).toBeNull()
  })

  it('devuelve la referencia cuando la hay', () => {
    expect(idDelSegmento({ id: 1, segmento: 7 })).toBe(7)
    expect(idDelSegmento({ id: 1, segmento: { id: 7 } })).toBe(7)
    expect(idDelSegmento({ id: 1, segmento: 'rodilla' })).toBe('rodilla')
  })
})
