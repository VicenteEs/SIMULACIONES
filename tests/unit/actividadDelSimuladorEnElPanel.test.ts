import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { RESULTADOS } from '@/lib/simulador'

vi.mock('@payload-config', () => ({ default: {} }))

import { resumenDeActividad } from '@/app/(frontend)/admin-panel/datos'

/**
 * Lo que el panel cuenta del simulador.
 *
 * `resumenDeActividad` es la única consulta que mira las columnas nuevas, y de
 * ella sale la pantalla donde el profesor ve en qué se atasca su gente. Lo que
 * se fija aquí es lo que puede torcerse sin que falle nada:
 *
 *  - que las filas de los otros cuatro módulos no se cuenten como partidas —las
 *    cinco colecciones escriben en la misma tabla—;
 *  - que un fallo al leer los recorridos no se disfrace de cero, que es una
 *    afirmación sobre los residentes y no sobre la base;
 *  - y que ese fallo no arrastre a las cifras de lectura, que se leyeron bien.
 */

const contar = vi.fn()
const buscar = vi.fn()

const payload = { count: contar, find: buscar } as unknown as Payload

const complicacion = (extra: Record<string, unknown> = {}) => ({
  paso: 'p1',
  numero: 3,
  titulo: 'Fresado del canal',
  resultado: RESULTADOS.FUERZA_EXCESIVA,
  detalle: 'Se produce una complicación. (95 N · rango útil 20–60 N)',
  ...extra,
})

/** Distingue las dos consultas por lo que preguntan, no por el orden. */
const respondiendo = (recorridos: unknown[]) => {
  buscar.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const esDelSimulador = JSON.stringify(where).includes('cirugias')
    return esDelSimulador
      ? { docs: recorridos, totalDocs: recorridos.length }
      : { docs: [], totalDocs: 0 }
  })
}

beforeEach(() => {
  contar.mockReset()
  buscar.mockReset()
  contar.mockResolvedValue({ totalDocs: 4 })
  respondiendo([])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('el resumen de actividad cuenta los recorridos del simulador', () => {
  it('trae los casos jugados, los que dañaron y dónde', async () => {
    respondiendo([
      { coleccion: 'cirugias', documentoId: '7', puntaje: 18, puntajeMaximo: 40, complicaciones: [complicacion()] },
      { coleccion: 'cirugias', documentoId: '7', puntaje: 30, puntajeMaximo: 40, complicaciones: [complicacion()] },
      { coleccion: 'cirugias', documentoId: '8', puntaje: 40, puntajeMaximo: 40, complicaciones: [] },
    ])

    const resumen = await resumenDeActividad(payload)
    expect(resumen.simulador.casos).toBe(3)
    expect(resumen.simulador.casosConComplicacion).toBe(2)
    expect(resumen.simulador.atascos).toHaveLength(1)
    expect(resumen.simulador.atascos[0].residentes).toBe(2)
    expect(resumen.simulador.ilegible).toBe(false)
  })

  it('una cirugía abierta y no jugada no cuenta como partida', async () => {
    // La consulta pide `coleccion: cirugias`, no «lo que tenga puntaje»: es
    // `recorridoGuardado` quien separa el caso recorrido del solo visitado, y si
    // deja de hacerlo el panel enseña partidas de cero puntos que nadie jugó.
    respondiendo([{ coleccion: 'cirugias', documentoId: '9', completado: false }])
    const resumen = await resumenDeActividad(payload)
    expect(resumen.simulador.casos).toBe(0)
  })

  it('pide solo las filas del simulador', async () => {
    // Cinco módulos escriben en esta tabla y solo uno juega: traerse las otras
    // para tirarlas gasta el tope de 1000 filas en lo que no se va a contar.
    await resumenDeActividad(payload)
    const delSimulador = buscar.mock.calls
      .map(([opciones]) => opciones)
      .find((opciones) => JSON.stringify(opciones.where).includes('cirugias'))
    expect(delSimulador, 'no se consultó por los recorridos').toBeTruthy()
    expect(delSimulador.limit).toBe(1000)
    expect(delSimulador.overrideAccess).toBe(true)
  })

  it('un fallo al leerlos se dice, no se convierte en un cero', async () => {
    buscar.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (JSON.stringify(where).includes('cirugias')) throw new Error('relation does not exist')
      return { docs: [], totalDocs: 0 }
    })

    const resumen = await resumenDeActividad(payload)
    expect(resumen.simulador.ilegible).toBe(true)
    expect(resumen.simulador.casos).toBe(0)
    // Y no arrastra a las cifras de lectura, que sí se leyeron: un panel que
    // dice no saber lo que sabe es tan inútil como uno que inventa.
    expect(resumen.ilegible).toBe(false)
    expect(resumen.registros).toBe(4)
  })
})
