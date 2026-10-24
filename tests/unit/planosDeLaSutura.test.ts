import { describe, expect, it } from 'vitest'
import {
  HERIDAS_QUE_CIERRA,
  cierreDeCadaHerida,
  cierreDeTodoElCierre,
  cierresPorPlano,
  juicioDelHiloEnElPlano,
  medirPorPlanos,
  planoDeLaPuntada,
  repartirPorPlanos,
  resumirPorPlanos,
} from '@/lib/planosDeLaSutura'
import { hiloDelInstrumento, type PuntoDeSutura } from '@/lib/sutura'

/** Un punto sobre una recta x = `x` (en metros), de un lado u otro de la herida. */
const punto = (x: number, lado: 1 | -1 | 0, plano: PuntoDeSutura['plano'], nuevaLinea = false): PuntoDeSutura => ({
  punto: [x, 0, 0],
  normal: [0, 0, 1],
  lado,
  nuevaLinea,
  plano,
})

describe('en qué plano cae una puntada', () => {
  it('el papel de la pieza tocada lo dice, y sin papel conocido es la piel de siempre', () => {
    expect(planoDeLaPuntada('piel')).toBe('piel')
    expect(planoDeLaPuntada('fascia')).toBe('fascia')
    expect(planoDeLaPuntada('musculo')).toBe('musculo')
    expect(planoDeLaPuntada('hueso')).toBe('piel')
    expect(planoDeLaPuntada(undefined)).toBe('piel')
  })
})

describe('qué hilo va a qué plano', () => {
  const vicryl2 = hiloDelInstrumento({ slug: 'sutura-vicryl-2-0', nombre: 'Vicryl 2-0' })!
  const vicryl3 = hiloDelInstrumento({ slug: 'sutura-vicryl-3-0', nombre: 'Vicryl 3-0' })!
  const nailon = hiloDelInstrumento({ slug: 'sutura-nylon-3-0', nombre: 'Nylon 3-0' })!
  const monocryl = hiloDelInstrumento({ slug: 'sutura-monocryl-5-0', nombre: 'Monocryl 5-0' })!

  it('el Vicryl 2-0 va a la fascia, y sobre la piel se avisa y no cuenta', () => {
    expect(juicioDelHiloEnElPlano(vicryl2, 'fascia')).toEqual({ acepta: true, texto: null })
    const mal = juicioDelHiloEnElPlano(vicryl2, 'piel')
    expect(mal.acepta).toBe(false)
    expect(mal.texto).toContain('Vicryl 2-0 va a la fascia')
  })

  it('el Vicryl 3-0 va a la fascia y al subcutáneo, que cae en el plano de la piel abierta', () => {
    expect(juicioDelHiloEnElPlano(vicryl3, 'fascia').acepta).toBe(true)
    expect(juicioDelHiloEnElPlano(vicryl3, 'piel').acepta).toBe(true)
  })

  it('el nailon y el Monocryl son de piel: sobre la fascia se avisa y no cuentan', () => {
    for (const hilo of [nailon, monocryl]) {
      expect(juicioDelHiloEnElPlano(hilo, 'piel')).toEqual({ acepta: true, texto: null })
      const mal = juicioDelHiloEnElPlano(hilo, 'fascia')
      expect(mal.acepta).toBe(false)
      expect(mal.texto).toContain('es de piel')
      expect(mal.texto).toContain('Vicryl')
    }
  })

  it('el músculo no se sutura con ningún hilo: el cierre profundo es el de la fascia', () => {
    for (const hilo of [vicryl2, vicryl3, nailon, monocryl]) {
      const j = juicioDelHiloEnElPlano(hilo, 'musculo')
      expect(j.acepta).toBe(false)
      expect(j.texto).toContain('fascia')
    }
  })

  it('un hilo creado a mano, sin planos declarados, va a donde se lo ponga (menos al músculo)', () => {
    const manual = hiloDelInstrumento({ slug: null, nombre: 'Seda 2-0 del residente' })!
    expect(manual.planos).toBeUndefined()
    expect(juicioDelHiloEnElPlano(manual, 'piel').acepta).toBe(true)
    expect(juicioDelHiloEnElPlano(manual, 'fascia').acepta).toBe(true)
    expect(juicioDelHiloEnElPlano(manual, 'musculo').acepta).toBe(false)
  })
})

describe('medir cada plano por su cuenta', () => {
  // Fascia: tres puntadas a 8 mm que cruzan; piel: dos puntadas a 6 mm. Todo en metros, con 1000 mm por unidad.
  const puntos: PuntoDeSutura[] = [
    punto(0.0, 1, 'fascia', true),
    punto(0.008, -1, 'fascia'),
    punto(0.016, 1, 'fascia'),
    punto(0.1, 1, 'piel', true),
    punto(0.106, -1, 'piel'),
  ]

  it('reparte los puntos por plano y abre una línea en el primero de cada uno', () => {
    const grupos = repartirPorPlanos(puntos)
    expect([...grupos.keys()].sort()).toEqual(['fascia', 'piel'])
    expect(grupos.get('fascia')).toHaveLength(3)
    expect(grupos.get('piel')![0].nuevaLinea).toBe(true)
  })

  it('un punto sin plano, de lo guardado antes, es de la piel', () => {
    const grupos = repartirPorPlanos([punto(0, 1, undefined, true), punto(0.005, -1, undefined)])
    expect([...grupos.keys()]).toEqual(['piel'])
  })

  it('cada plano cuenta sus puntadas, sus cruces y su separación, y no mezcla las del otro', () => {
    const m = medirPorPlanos(puntos, 1000)
    expect(m.fascia?.puntadas).toBe(3)
    expect(m.fascia?.cruces).toBe(2)
    expect(m.fascia?.separacionMediaMm).toBeCloseTo(8, 5)
    expect(m.piel?.puntadas).toBe(2)
    expect(m.piel?.cruces).toBe(1)
    expect(m.piel?.separacionMediaMm).toBeCloseTo(6, 5)
    // El salto de la fascia a la piel (84 mm) no es una puntada de ninguno.
    expect(m.fascia?.separacionMaximaMm).toBeLessThan(10)
    expect(m.piel?.separacionMaximaMm).toBeLessThan(10)
  })
})

describe('cerrar cada plano con sus puntadas', () => {
  const puntosDeFascia: PuntoDeSutura[] = [
    punto(0.0, 1, 'fascia', true),
    punto(0.01, -1, 'fascia'),
    punto(0.02, 1, 'fascia'),
    punto(0.03, -1, 'fascia'),
  ]
  const porPlano = medirPorPlanos(puntosDeFascia, 1000)

  it('la fascia con tres cruces en una herida de 30 mm y la tensión justa queda cerrada; la piel sin puntadas, no', () => {
    const cierres = cierresPorPlano(porPlano, { fascia: 30, piel: 30 }, { fascia: 0.8, piel: 0.8 })
    expect(cierres.fascia?.cierre).toBeCloseTo(1, 5)
    expect(cierres.piel?.cierre).toBe(0)
    expect(cierres.piel?.cierreMaximo).toBe(0)
  })

  it('cada plano usa su propia tensión: apretar la fascia no cierra la piel', () => {
    const cierres = cierresPorPlano(porPlano, { fascia: 30, piel: 30 }, { fascia: 0.8, piel: 0 })
    expect(cierres.fascia?.cierre).toBeCloseTo(1, 5)
    expect(cierres.piel?.cierre).toBe(0)
  })

  it('la sutura de la fascia cierra también la herida del músculo, y la de la piel solo la piel', () => {
    expect(HERIDAS_QUE_CIERRA.fascia).toContain('musculo')
    expect(HERIDAS_QUE_CIERRA.piel).toEqual(['piel'])
    const cierres = cierresPorPlano(porPlano, { fascia: 30, piel: 30 }, { fascia: 0.8 })
    const heridas = cierreDeCadaHerida(cierres, ['piel', 'fascia', 'musculo'])
    expect(heridas.fascia).toBeCloseTo(1, 5)
    expect(heridas.musculo).toBeCloseTo(1, 5)
    expect(heridas.piel).toBe(0)
  })

  it('con la piel cosida y la fascia abierta la herida no está cerrada: es el cierre que alarmó a Cristóbal', () => {
    const solo = cierreDeCadaHerida({ piel: { cierre: 1, cierreMaximo: 1 }, fascia: { cierre: 0, cierreMaximo: 0 } }, ['piel', 'fascia'])
    expect(cierreDeTodoElCierre(solo, ['piel', 'fascia'])).toBe(0)
    const ambas = cierreDeCadaHerida({ piel: { cierre: 1, cierreMaximo: 1 }, fascia: { cierre: 1, cierreMaximo: 1 } }, ['piel', 'fascia'])
    expect(cierreDeTodoElCierre(ambas, ['piel', 'fascia'])).toBe(1)
  })

  it('el cierre de todo es el del plano menos cerrado entre los que tienen herida, y 0 sin ninguna', () => {
    expect(cierreDeTodoElCierre({ piel: 0.6, fascia: 0.9 }, ['piel', 'fascia'])).toBeCloseTo(0.6, 6)
    expect(cierreDeTodoElCierre({ piel: 0.6, fascia: 0.9 }, ['piel'])).toBeCloseTo(0.6, 6)
    expect(cierreDeTodoElCierre({ piel: 0.6 }, [])).toBe(0)
    // El músculo no se exige: lo cierra la fascia.
    expect(cierreDeTodoElCierre({ piel: 1, fascia: 1, musculo: 0 }, ['piel', 'fascia', 'musculo'])).toBe(1)
  })
})

describe('el resumen por plano', () => {
  it('trae los planos con puntadas o con herida, de la superficie hacia dentro, con su nombre', () => {
    const puntos: PuntoDeSutura[] = [punto(0, 1, 'fascia', true), punto(0.01, -1, 'fascia')]
    const porPlano = medirPorPlanos(puntos, 1000)
    const cierres = cierresPorPlano(porPlano, { fascia: 20, piel: 20 }, { fascia: 0.4 })
    const r = resumirPorPlanos(porPlano, cierres, { fascia: 0.4 }, ['piel', 'fascia'])
    expect(r.map((x) => x.plano)).toEqual(['piel', 'fascia'])
    expect(r.map((x) => x.nombre)).toEqual(['Piel', 'Fascia'])
    expect(r[0]).toMatchObject({ puntadas: 0, conHerida: true, cierre: 0 })
    expect(r[1]).toMatchObject({ puntadas: 2, cruces: 1, conHerida: true, tension: 0.4 })
  })
})
