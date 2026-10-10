import { describe, expect, it } from 'vitest'
import {
  SEPARACION_IDEAL_MM,
  TENSION_DE_CIERRE,
  TENSION_QUE_ESTRANGULA,
  cierreConTension,
  cierreDeLaHerida,
  hiloDelInstrumento,
  juicioDeLaPuntada,
  juicioDeLaTension,
  medirLaSutura,
  traccionDelHilo,
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

describe('tirar del hilo (D-171)', () => {
  it('con el hilo flojo no se cierra nada, aunque las puntadas crucen', () => {
    expect(cierreConTension(6, 40, 0)).toBe(0)
    expect(traccionDelHilo(0)).toBe(0)
  })

  it('la tracción llega al máximo con la tensión de cierre y no pasa de ahí', () => {
    expect(traccionDelHilo(TENSION_DE_CIERRE)).toBe(1)
    expect(traccionDelHilo(TENSION_DE_CIERRE / 2)).toBeCloseTo(0.5, 9)
    expect(traccionDelHilo(1)).toBe(1)
    expect(traccionDelHilo(-3)).toBe(0)
  })

  it('el cierre es lo que las puntadas permiten por lo que se tira', () => {
    // 2 cruces en 40 mm: 50 % posible.
    expect(cierreConTension(2, 40, TENSION_DE_CIERRE)).toBeCloseTo(0.5, 9)
    expect(cierreConTension(2, 40, TENSION_DE_CIERRE / 2)).toBeCloseTo(0.25, 9)
    // 4 cruces en 40 mm: todo.
    expect(cierreConTension(4, 40, 1)).toBe(1)
  })

  it('sin cruces, tirar no acerca nada y se dice', () => {
    const j = juicioDeLaTension({ tension: 0.5, cruces: 0, cierreMaximo: 0 })
    expect(j?.texto).toMatch(/ninguna puntada cruza/i)
    expect(juicioDeLaTension({ tension: 0, cruces: 0, cierreMaximo: 0 })).toBeNull()
  })

  it('con pocas puntadas dice cuántas faltan, y no pide más fuerza', () => {
    const j = juicioDeLaTension({ tension: 0.85, cruces: 2, cierreMaximo: 0.25, largoMm: 80 })
    expect(j?.atencion).toBe(true)
    expect(j?.texto).toMatch(/faltan unas 6 puntadas más/)
    expect(j?.estrangula).toBe(false)
  })

  it('el hilo flojo, el justo y el que estrangula se distinguen', () => {
    const base = { cruces: 5, cierreMaximo: 1 }
    expect(juicioDeLaTension({ ...base, tension: 0.3 })?.texto).toMatch(/flojo/)
    const justo = juicioDeLaTension({ ...base, tension: TENSION_DE_CIERRE })
    expect(justo?.atencion).toBe(false)
    expect(justo?.texto).toMatch(/afrontados/)
    const apretado = juicioDeLaTension({ ...base, tension: TENSION_QUE_ESTRANGULA + 0.03 })
    expect(apretado?.estrangula).toBe(true)
    expect(apretado?.texto).toMatch(/estrangula/)
  })
})
