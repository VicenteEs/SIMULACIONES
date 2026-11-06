import { describe, expect, it } from 'vitest'
import {
  evaluarGesto,
  instruccionDelPaso,
  objetivoDelPaso,
  RESULTADOS,
  tornillosPorFragmentoPorOmision,
  tornillosQuePideElFragmento,
  type Gesto,
  type PasoQuirurgico,
  type TornillosDelFragmento,
} from '@/lib/simulador'
import { listaDelPaso } from '@/lib/listaDelPaso'
import { resumenDeLaFijacion, type EstadoDeLaFijacion, type TornilloPuesto } from '@/lib/fijacion'

/**
 * Los tornillos de la placa en cada fragmento principal (D-309).
 *
 * El paso contaba el total, y seis tornillos metidos en un solo trozo aprobaban un paso que pedía seis: la placa no
 * sostenía el otro fragmento y la nota decía que sí. Lo que se vigila aquí es que esa cuenta se haga, que la lista diga
 * lo mismo que la evaluación y que un caso sin fractura —o una sesión de antes, sin el trozo de cada agujero— siga
 * juzgándose como siempre.
 */

const trozo = (nodo: string, nombre: string, tornillos: number, bloqueados = 0): TornillosDelFragmento => ({
  nodo,
  nombre,
  tornillos,
  bloqueados,
})
const proximal = (n: number, bloqueados = 0) => trozo('tibia_proximal', 'tibia proximal', n, bloqueados)
const distal = (n: number, bloqueados = 0) => trozo('tibia_distal', 'tibia distal', n, bloqueados)

const INSTRUMENTO = 'tornillo-cortical-3-5'
const PASO: PasoQuirurgico = { objetivo: 'fijacion', instrumento: INSTRUMENTO, tornillosMinimos: 6 }

/** Una placa con estos tornillos por fragmento, todos bicorticales y ninguno largo. */
const placa = (porFragmento: TornillosDelFragmento[]): Gesto => {
  const tornillos = porFragmento.reduce((suma, t) => suma + t.tornillos, 0)
  return { instrumento: INSTRUMENTO, fijacion: { placa: true, tornillos, bicorticales: tornillos, largos: 0, porFragmento } }
}

describe('lo que pide cada fragmento por omisión, que es lo de la AO', () => {
  it('tres en la tibia y en lo que no se reconoce; cuatro en el fémur y el húmero', () => {
    expect(tornillosPorFragmentoPorOmision({ nodo: 'tibia_distal', tornillos: 2, bloqueados: 0 })).toBe(3)
    expect(tornillosPorFragmentoPorOmision({ nodo: 'pieza_7', tornillos: 0, bloqueados: 0 })).toBe(3)
    expect(tornillosPorFragmentoPorOmision({ nodo: 'femur_distal', tornillos: 2, bloqueados: 0 })).toBe(4)
    expect(tornillosPorFragmentoPorOmision({ nodo: 'Fémur proximal', tornillos: 0, bloqueados: 0 })).toBe(4)
    expect(tornillosPorFragmentoPorOmision({ nodo: 'humero_diafisis', tornillos: 1, bloqueados: 0 })).toBe(4)
    expect(tornillosPorFragmentoPorOmision({ nodo: 'Húmero', tornillos: 1, bloqueados: 0 })).toBe(4)
  })

  it('con todos bloqueados bastan tres en cualquier hueso; con uno sin bloquear, no', () => {
    expect(tornillosPorFragmentoPorOmision({ nodo: 'femur_distal', tornillos: 3, bloqueados: 3 })).toBe(3)
    expect(tornillosPorFragmentoPorOmision({ nodo: 'femur_distal', tornillos: 3, bloqueados: 2 })).toBe(4)
    // Sin tornillos todavía no son «todos bloqueados»: un fragmento vacío no puede rebajar lo que pide.
    expect(tornillosPorFragmentoPorOmision({ nodo: 'femur_distal', tornillos: 0, bloqueados: 0 })).toBe(4)
  })

  it('un número escrito en el paso manda sobre lo de la AO', () => {
    expect(tornillosQuePideElFragmento({ tornillosPorFragmento: 2 }, trozo('femur_distal', 'fémur distal', 0))).toBe(2)
    expect(tornillosQuePideElFragmento({}, trozo('femur_distal', 'fémur distal', 0))).toBe(4)
  })
})

describe('la evaluación cuenta los tornillos de cada fragmento', () => {
  it('seis tornillos en un solo fragmento ya no aprueban: la placa no cruza la fractura', () => {
    const e = evaluarGesto(PASO, placa([proximal(6)]))
    expect(e.resultado).toBe(RESULTADOS.TORNILLOS_POR_FRAGMENTO)
    expect(e.avanza).toBe(false)
    // Es un fallo y no una complicación: no dañó nada, solo no fija.
    expect(e.complicacion).toBe(false)
    expect(e.mensaje).toContain('todos sus agujeros caen en tibia proximal')
  })

  it('una placa sin ningún agujero sobre el hueso tampoco cruza nada', () => {
    const gesto: Gesto = { instrumento: INSTRUMENTO, fijacion: { placa: true, tornillos: 6, bicorticales: 6, largos: 0, porFragmento: [] } }
    const e = evaluarGesto(PASO, gesto)
    expect(e.resultado).toBe(RESULTADOS.TORNILLOS_POR_FRAGMENTO)
    expect(e.mensaje).toContain('ningún agujero cae sobre el hueso')
  })

  it('tres y tres en la tibia aprueban; dos y cuatro no, y dice cuál se quedó corto', () => {
    expect(evaluarGesto(PASO, placa([proximal(3), distal(3)])).resultado).toBe(RESULTADOS.CORRECTO)
    const e = evaluarGesto(PASO, placa([proximal(2), distal(4)]))
    expect(e.resultado).toBe(RESULTADOS.TORNILLOS_POR_FRAGMENTO)
    expect(e.mensaje).toContain('tibia proximal: 2 de 3 tornillos')
    expect(e.mensaje).not.toContain('tibia distal')
  })

  it('el fémur pide cuatro, salvo que todos los del fragmento sean bloqueados', () => {
    const femur = (n: number, bloqueados = 0) => [
      trozo('femur_proximal', 'fémur proximal', n, bloqueados),
      trozo('femur_distal', 'fémur distal', 4, bloqueados ? 4 : 0),
    ]
    expect(evaluarGesto(PASO, placa(femur(3))).mensaje).toContain('fémur proximal: 3 de 4 tornillos')
    expect(evaluarGesto(PASO, placa(femur(3, 3))).resultado).toBe(RESULTADOS.CORRECTO)
  })

  it('el número escrito en el paso manda, y el 0 apaga la cuenta', () => {
    expect(evaluarGesto({ ...PASO, tornillosPorFragmento: 2 }, placa([proximal(2), distal(4)])).resultado).toBe(RESULTADOS.CORRECTO)
    expect(evaluarGesto({ ...PASO, tornillosPorFragmento: 4 }, placa([proximal(3), distal(3)])).mensaje).toContain('3 de 4')
    // Un 0 es decisión del editor —una placa que se apoya a propósito en un solo trozo—: no se cuenta nada.
    expect(evaluarGesto({ ...PASO, tornillosPorFragmento: 0 }, placa([proximal(6)])).resultado).toBe(RESULTADOS.CORRECTO)
  })

  it('el total va antes: con menos tornillos de los pedidos, eso es lo que se dice', () => {
    const e = evaluarGesto(PASO, placa([proximal(2), distal(2)]))
    expect(e.resultado).toBe(RESULTADOS.TORNILLOS_INSUFICIENTES)
    expect(e.mensaje).toContain('4 de 6')
  })

  it('sin la cuenta por fragmento —sin fractura, o una sesión de antes— se juzga el total, como siempre', () => {
    const gesto: Gesto = { instrumento: INSTRUMENTO, fijacion: { placa: true, tornillos: 6, bicorticales: 6, largos: 0 } }
    expect(evaluarGesto(PASO, gesto).resultado).toBe(RESULTADOS.CORRECTO)
  })
})

describe('la instrucción y la lista lo dicen antes de operar', () => {
  it('la instrucción nombra lo que pide cada fragmento, o el número escrito, o nada con el 0', () => {
    expect(instruccionDelPaso({ objetivo: 'fijacion', tornillosMinimos: 6 })).toContain(
      '3 en la tibia y el antebrazo, 4 en el fémur y el húmero, y 3 si todos son bloqueados',
    )
    expect(instruccionDelPaso({ objetivo: 'fijacion', tornillosPorFragmento: 2 })).toContain(
      'Cada fragmento principal lleva al menos 2.',
    )
    expect(instruccionDelPaso({ objetivo: 'fijacion', tornillosPorFragmento: 0 })).not.toContain('fragmento principal')
  })

  it('un paso que solo escribe los de cada fragmento es de fijación, aunque diga «instrumento»', () => {
    expect(objetivoDelPaso({ tornillosPorFragmento: 3 })).toBe('fijacion')
    expect(objetivoDelPaso({ objetivo: 'instrumento', tornillosPorFragmento: 3 })).toBe('fijacion')
  })

  const opciones = { revelarElInstrumento: true, nombreDelInstrumento: 'Tornillo cortical 3,5', juzgar: true }
  const punto = (paso: PasoQuirurgico, gesto: Gesto) => listaDelPaso(paso, gesto, opciones).find((p) => p.clave === 'porFragmento')

  it('la lista marca el punto como la evaluación lo juzga, con lo que lleva cada uno', () => {
    // Lo que importa de la lista es que no mienta: todo en verde es que «Aplicar paso» avanza (P-009).
    const casos: [PasoQuirurgico, Gesto][] = [
      [PASO, placa([proximal(6)])],
      [PASO, placa([proximal(3), distal(3)])],
      [PASO, placa([proximal(2), distal(4)])],
      [{ ...PASO, tornillosPorFragmento: 2 }, placa([proximal(2), distal(4)])],
      [{ ...PASO, tornillosPorFragmento: 0 }, placa([proximal(6)])],
    ]
    for (const [paso, gesto] of casos) {
      const todoHecho = listaDelPaso(paso, gesto, opciones).every((p) => p.estado === 'hecho')
      expect(todoHecho, JSON.stringify([paso.tornillosPorFragmento, gesto.fijacion?.porFragmento])).toBe(evaluarGesto(paso, gesto).avanza)
    }
    expect(punto(PASO, placa([proximal(2), distal(4)]))).toMatchObject({
      estado: 'falta',
      ahora: 'tibia proximal, 2 de 3 · tibia distal, 4 de 3',
    })
    expect(punto(PASO, placa([proximal(6)]))).toMatchObject({ estado: 'falta', ahora: 'la placa no cruza la fractura' })
  })

  it('sin cuenta por fragmento, o con el 0, el punto no aparece: no se puede cumplir lo que no se mide', () => {
    const sinCuenta: Gesto = { instrumento: INSTRUMENTO, fijacion: { placa: true, tornillos: 6, bicorticales: 6, largos: 0 } }
    expect(punto(PASO, sinCuenta)).toBeUndefined()
    expect(punto({ ...PASO, tornillosPorFragmento: 0 }, placa([proximal(6)]))).toBeUndefined()
  })
})

describe('el resumen de la fijación cuenta por fragmento', () => {
  const tornillo = (agujero: number, extra: Partial<TornilloPuesto> = {}): TornilloPuesto => ({
    agujero,
    largoMm: 30,
    diametroMm: 3.5,
    bicortical: true,
    puntaFueraMm: 1,
    espesorMm: 20,
    bloqueado: false,
    aviso: null,
    ...extra,
  })

  /**
   * Una placa de nueve agujeros: cuatro sobre el proximal, uno sobre una mariposa y cuatro sobre el distal. Los
   * tornillos de la trayectoria y del clavo se cuentan en el total, pero no son de la placa.
   */
  const estado = (conTrozoDeCadaAgujero = true): EstadoDeLaFijacion => ({
    placa: {
      nombre: 'Placa LC-DCP de 9 agujeros',
      agujeros: 9,
      apoyada: true,
      separadaDelHuesoMm: 0.2,
      asiento: {
        contactoPct: 90,
        sinHuesoPct: 0,
        holguraMediaMm: 0.2,
        trozos: [
          { nodo: 'tibia_proximal', agujeros: 4, holguraMinimaMm: 0.1 },
          { nodo: 'tibia_distal', agujeros: 4, holguraMinimaMm: 0.1 },
          { nodo: 'mariposa', agujeros: 1, holguraMinimaMm: 0.3 },
        ],
        agujerosSinHueso: 0,
        ...(conTrozoDeCadaAgujero
          ? {
              trozoDeCadaAgujero: [
                'tibia_proximal',
                'tibia_proximal',
                'tibia_proximal',
                'tibia_proximal',
                'mariposa',
                'tibia_distal',
                'tibia_distal',
                'tibia_distal',
                'tibia_distal',
              ],
            }
          : {}),
      },
    },
    tornillos: [
      tornillo(0, { bloqueado: true }),
      tornillo(1),
      tornillo(2),
      tornillo(4),
      tornillo(5),
      tornillo(6),
      tornillo(7),
      // Por una trayectoria de dos clics: no entra por ningún agujero de la placa.
      tornillo(-1, { libre: true }),
      // Del clavo: aunque su índice cayera sobre un agujero del proximal, no es de la placa.
      tornillo(3, { deClavo: 'P1', punteria: 'acierta' }),
    ],
  })
  const nombres: Record<string, string> = { tibia_proximal: 'Tibia proximal', tibia_distal: 'Tibia distal' }
  const nombreDe = (nodo: string) => nombres[nodo] ?? nodo

  it('los dos trozos con más agujeros, con los tornillos de la placa en cada uno y cuántos son bloqueados', () => {
    const r = resumenDeLaFijacion(estado(), { hayFractura: true, nombreDe })
    expect(r.tornillos).toBe(9)
    expect(r.porFragmento).toEqual([
      { nodo: 'tibia_proximal', nombre: 'Tibia proximal', tornillos: 3, bloqueados: 1 },
      { nodo: 'tibia_distal', nombre: 'Tibia distal', tornillos: 3, bloqueados: 0 },
    ])
  })

  it('la mariposa no cuenta: un tercer trozo no tiene por qué llevar tres tornillos', () => {
    const r = resumenDeLaFijacion(estado(), { hayFractura: true, nombreDe })
    expect(r.porFragmento?.map((t) => t.nodo)).not.toContain('mariposa')
  })

  it('sin nombre de la pieza, el del nodo, legible', () => {
    const r = resumenDeLaFijacion(estado(), { hayFractura: true })
    expect(r.porFragmento?.[0].nombre).toBe('tibia proximal')
  })

  it('sin fractura en el caso, o con una sesión de antes, no hay cuenta por fragmento', () => {
    expect(resumenDeLaFijacion(estado(), {}).porFragmento).toBeUndefined()
    expect(resumenDeLaFijacion(estado(false), { hayFractura: true }).porFragmento).toBeUndefined()
    expect(resumenDeLaFijacion(null, { hayFractura: true }).porFragmento).toBeUndefined()
  })

  it('con la cuenta del resumen, el paso juzga lo mismo que con la lista a mano', () => {
    const r = resumenDeLaFijacion(estado(), { hayFractura: true, nombreDe })
    const gesto: Gesto = { instrumento: INSTRUMENTO, fijacion: r }
    // Nueve tornillos en total, tres y tres en los principales: aprueba la tibia, que pide tres.
    expect(evaluarGesto(PASO, gesto).resultado).toBe(RESULTADOS.CORRECTO)
    // Con cuatro por fragmento escritos en el paso, ya no.
    expect(evaluarGesto({ ...PASO, tornillosPorFragmento: 4 }, gesto).mensaje).toContain('Tibia proximal: 3 de 4 tornillos')
  })
})
