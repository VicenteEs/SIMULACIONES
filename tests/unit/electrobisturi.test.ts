import { describe, expect, it } from 'vitest'
import {
  esElectrobisturi,
  juicioDeLaPotencia,
  limitarPotencia,
  POTENCIA_MAXIMA_W,
  POTENCIA_MINIMA_PARA_CORTAR_W,
  POTENCIA_QUE_QUEMA_W,
  RANGO_HABITUAL,
} from '@/lib/electrobisturi'
import { comportamientoDelInstrumento } from '@/lib/comportamientoDelInstrumento'

describe('la potencia del electrobisturí, en vatios de 0 a 100', () => {
  it('la escala es de 0 a 100 y se limita a ella', () => {
    expect(POTENCIA_MAXIMA_W).toBe(100)
    expect(limitarPotencia(-5)).toBe(0)
    expect(limitarPotencia(250)).toBe(100)
    expect(limitarPotencia(37.6)).toBe(38)
    expect(limitarPotencia(Number.NaN)).toBe(0)
  })

  it('con 0 W no corta, y con muy poca arrastra sin cortar', () => {
    const cero = juicioDeLaPotencia('corte', 0)
    expect(cero.corta).toBe(false)
    expect(cero.atencion).toBe(true)
    expect(cero.texto).toMatch(/0 W/)
    const poca = juicioDeLaPotencia('corte', POTENCIA_MINIMA_PARA_CORTAR_W - 1)
    expect(poca.corta).toBe(false)
    expect(poca.texto).toMatch(/arrastra/)
  })

  it('en el rango habitual corta limpio y no avisa', () => {
    const [minimo, maximo] = RANGO_HABITUAL.corte
    for (const w of [minimo, Math.round((minimo + maximo) / 2), maximo]) {
      const j = juicioDeLaPotencia('corte', w)
      expect(j.corta, `${w} W`).toBe(true)
      expect(j.atencion, `${w} W`).toBe(false)
      expect(j.quema, `${w} W`).toBe(false)
    }
  })

  it('un poco por encima del rango avisa, y por encima del tope quema los bordes', () => {
    const alta = juicioDeLaPotencia('corte', RANGO_HABITUAL.corte[1] + 10)
    expect(alta.atencion).toBe(true)
    expect(alta.corta).toBe(true)
    expect(alta.quema).toBe(false)
    const excesiva = juicioDeLaPotencia('corte', POTENCIA_QUE_QUEMA_W + 5)
    expect(excesiva.quema).toBe(true)
    expect(excesiva.texto).toMatch(/carboniza/)
  })

  it('en coagulación nunca corta: sella los vasos', () => {
    for (const w of [0, 20, 35, 60, 100]) {
      expect(juicioDeLaPotencia('coagulacion', w).corta, `${w} W`).toBe(false)
    }
    const bien = juicioDeLaPotencia('coagulacion', 35)
    expect(bien.atencion).toBe(false)
    expect(bien.texto).toMatch(/[Ss]ella/)
    expect(juicioDeLaPotencia('coagulacion', 90).quema).toBe(true)
  })

  it('se reconoce por identificador y por nombre', () => {
    expect(esElectrobisturi({ slug: 'electrobisturi', nombre: 'lo que sea' })).toBe(true)
    expect(esElectrobisturi({ nombre: 'Electrobisturí monopolar' })).toBe(true)
    expect(esElectrobisturi({ nombre: 'Termocauterio' })).toBe(true)
    expect(esElectrobisturi({ slug: 'bisturi-profundo-n15', nombre: 'Bisturí profundo' })).toBe(false)
  })

  it('el instrumento lo declara el comportamiento: corta los planos profundos y lleva potencia', () => {
    const que = comportamientoDelInstrumento({ slug: 'electrobisturi', nombre: 'Electrobisturí de dos botones' })
    expect(que.electro).toBe(true)
    expect(que.corta).toBe('musculo')
    // Uno creado a mano en el panel, sin identificador, también.
    expect(comportamientoDelInstrumento({ nombre: 'Electrobisturí del pabellón 2' }).electro).toBe(true)
    expect(comportamientoDelInstrumento({ slug: 'bisturi-piel-n22', nombre: 'Bisturí de piel' }).electro).toBe(false)
  })
})
