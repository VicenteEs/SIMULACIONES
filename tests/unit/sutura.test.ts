import { describe, expect, it } from 'vitest'
import {
  SEPARACION_IDEAL_MM,
  cierreDeLaHerida,
  hiloDelInstrumento,
  juicioDeLaPuntada,
  medirLaSutura,
  type PuntoDeSutura,
} from '@/lib/sutura'

/**
 * Las cuentas de la sutura (D-169): separación entre puntadas, cruces de la herida
 * y cuánto cierra. Con milímetros por unidad = 1000 (glTF en metros) una unidad del
 * lienzo son mil milímetros, así que 0,008 es un tramo de 8 mm.
 */

const punto = (x: number, lado: 1 | -1 | 0, nuevaLinea = false): PuntoDeSutura => ({
  punto: [x, 0, 0],
  normal: [0, 0, 1],
  lado,
  nuevaLinea,
})

describe('medirLaSutura', () => {
  it('mide la separación entre puntadas en milímetros', () => {
    const m = medirLaSutura([punto(0, 1, true), punto(0.008, -1), punto(0.016, 1)], 1000)
    expect(m.puntadas).toBe(3)
    expect(m.tramos).toBe(2)
    expect(m.separacionesMm[0]).toBeCloseTo(8, 6)
    expect(m.largoDeHiloMm).toBeCloseTo(16, 6)
    expect(m.separacionMediaMm).toBeCloseTo(8, 6)
    expect(m.bienEspaciadas).toBe(2)
  })

  it('cuenta como cruce solo el tramo que pasa de un lado de la herida al otro', () => {
    const m = medirLaSutura([punto(0, 1, true), punto(0.008, -1), punto(0.016, -1), punto(0.024, 1)], 1000)
    expect(m.cruces).toBe(2)
  })

  it('sin herida cerca (lado 0) no hay cruces, por larga que sea la sutura', () => {
    const m = medirLaSutura([punto(0, 0, true), punto(0.008, 0), punto(0.016, 0)], 1000)
    expect(m.cruces).toBe(0)
  })

  it('una línea nueva no se une a la anterior: ese tramo ni mide ni cruza', () => {
    const m = medirLaSutura([punto(0, 1, true), punto(0.008, -1), punto(0.2, 1, true), punto(0.208, -1)], 1000)
    expect(m.tramos).toBe(2)
    expect(m.cruces).toBe(2)
    expect(m.largoDeHiloMm).toBeCloseTo(16, 6)
  })

  it('con un archivo en milímetros la unidad es un milímetro', () => {
    const m = medirLaSutura([punto(0, 1, true), punto(8, -1)], 1)
    expect(m.separacionesMm[0]).toBeCloseTo(8, 6)
  })

  it('una sutura vacía mide cero sin dividir por cero', () => {
    const m = medirLaSutura([], 1000)
    expect(m).toMatchObject({ puntadas: 0, tramos: 0, separacionMediaMm: 0, separacionMinimaMm: 0, separacionMaximaMm: 0 })
  })
})

describe('cierreDeLaHerida', () => {
  it('cada cruce cubre diez milímetros de herida', () => {
    expect(cierreDeLaHerida(1, 40)).toBeCloseTo(0.25, 6)
    expect(cierreDeLaHerida(2, 40)).toBeCloseTo(0.5, 6)
  })
  it('se queda en 1 aunque haya más cruces que tramos', () => {
    expect(cierreDeLaHerida(10, 40)).toBe(1)
  })
  it('sin cruces o sin herida no cierra nada', () => {
    expect(cierreDeLaHerida(0, 40)).toBe(0)
    expect(cierreDeLaHerida(3, 0)).toBe(0)
  })
})

describe('juicioDeLaPuntada', () => {
  it('no dice nada de la primera puntada ni de una bien espaciada', () => {
    expect(juicioDeLaPuntada(null)).toBeNull()
    expect(juicioDeLaPuntada(SEPARACION_IDEAL_MM.min)).toBeNull()
    expect(juicioDeLaPuntada(SEPARACION_IDEAL_MM.max)).toBeNull()
  })
  it('avisa si está muy cerca o muy separada', () => {
    expect(juicioDeLaPuntada(2)).toMatch(/muy cerca/)
    expect(juicioDeLaPuntada(15)).toMatch(/muy separada/)
  })
  it('un salto a otro sitio no se juzga como puntada', () => {
    expect(juicioDeLaPuntada(60)).toBeNull()
  })
})

describe('hiloDelInstrumento', () => {
  it('reconoce los hilos del catálogo por su slug', () => {
    expect(hiloDelInstrumento({ slug: 'sutura-nylon-3-0', nombre: 'x' })?.nombre).toBe('Nylon 3-0')
  })
  it('un instrumento que no es hilo no cose', () => {
    expect(hiloDelInstrumento({ slug: 'pinza-diseccion-con-dientes', nombre: 'Pinza de disección con dientes' })).toBeNull()
  })
})
