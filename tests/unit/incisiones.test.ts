import { describe, expect, it } from 'vitest'
import {
  alargarIncision,
  incisionQueAlarga,
  rotuloDeLaIncision,
  UMBRAL_PARA_ALARGAR_MM,
  type Punto,
  type TrazoDeIncision,
} from '@/lib/incisiones'

/** Un trazo recto a lo largo de X, a la altura `y`, con la normal hacia +Z. */
function recta(de: number, a: number, y = 0): TrazoDeIncision {
  const puntos: Punto[] = []
  const normales: Punto[] = []
  const paso = de <= a ? 1 : -1
  for (let x = de; paso > 0 ? x <= a : x >= a; x += paso) {
    puntos.push([x, y, 0])
    normales.push([0, 0, 1])
  }
  return { puntos, normales }
}

describe('un trazo que empieza donde terminó otro lo alarga (P-003 E4.4)', () => {
  it('une el final de una con el inicio del trazo nuevo, sin repetir el punto de unión', () => {
    const base = recta(0, 10)
    const nuevo = recta(10, 20)
    const unida = alargarIncision(base, nuevo, 1)!
    expect(unida.puntos[0]).toEqual([0, 0, 0])
    expect(unida.puntos[unida.puntos.length - 1]).toEqual([20, 0, 0])
    expect(unida.puntos.length).toBe(21)
    // Cada punto con su normal.
    expect(unida.normales.length).toBe(unida.puntos.length)
  })

  it('acepta un trazo hecho en el otro sentido: se invierte para que la incisión siga siendo una sola línea', () => {
    const unida = alargarIncision(recta(0, 10), recta(20, 10), 1)!
    expect(unida.puntos.map((p) => p[0])).toEqual([...Array(21).keys()])
  })

  it('también se alarga por el inicio: un trazo que termina donde empieza la incisión va delante', () => {
    const unida = alargarIncision(recta(10, 20), recta(0, 10), 1)!
    expect(unida.puntos[0][0]).toBe(0)
    expect(unida.puntos[unida.puntos.length - 1][0]).toBe(20)
  })

  it('y por el inicio con el trazo en sentido contrario', () => {
    const unida = alargarIncision(recta(10, 20), recta(-5, 10), 1)!
    expect(unida.puntos[0][0]).toBe(-5)
    expect(unida.puntos[unida.puntos.length - 1][0]).toBe(20)
  })

  it('un trazo que no toca ningún extremo es otra incisión', () => {
    expect(alargarIncision(recta(0, 10), recta(0, 10, 15), UMBRAL_PARA_ALARGAR_MM)).toBeNull()
    // Aunque cruce la incisión por el medio: lo que cuenta son los extremos.
    expect(alargarIncision(recta(0, 10), { puntos: [[5, -10, 0], [5, 10, 0]], normales: [[0, 0, 1], [0, 0, 1]] }, 1)).toBeNull()
  })

  it('el umbral es el borde: a justo la distancia todavía alarga, un poco más ya no', () => {
    expect(alargarIncision(recta(0, 10), recta(14, 20), 5)).not.toBeNull()
    expect(alargarIncision(recta(0, 10), recta(16, 20), 5)).toBeNull()
  })

  it('no hace nada con menos de dos puntos', () => {
    const vacio: TrazoDeIncision = { puntos: [], normales: [] }
    expect(alargarIncision(vacio, recta(0, 10), 5)).toBeNull()
    expect(alargarIncision(recta(0, 10), vacio, 5)).toBeNull()
  })

  it('no modifica ni la incisión ni el trazo que se le dan', () => {
    const base = recta(0, 10)
    const nuevo = recta(20, 10)
    const copiaBase = JSON.stringify(base)
    const copiaNuevo = JSON.stringify(nuevo)
    alargarIncision(base, nuevo, 1)
    expect(JSON.stringify(base)).toBe(copiaBase)
    expect(JSON.stringify(nuevo)).toBe(copiaNuevo)
  })
})

describe('qué incisión alarga un trazo (P-003 E4.4)', () => {
  const existentes = [
    { id: 1, capa: 'piel', ...recta(0, 10) },
    { id: 2, capa: 'piel', ...recta(0, 10, 30) },
    { id: 3, capa: 'musculo', ...recta(0, 10, 60) },
  ]

  it('elige la de su capa cuyo extremo esté más cerca', () => {
    const r = incisionQueAlarga(existentes, 'piel', recta(10, 20, 30), 5)!
    expect(r.id).toBe(2)
    expect(r.unida.puntos[r.unida.puntos.length - 1]).toEqual([20, 30, 0])
  })

  it('ignora las de otra capa aunque estén al lado', () => {
    expect(incisionQueAlarga(existentes, 'piel', recta(10, 20, 60), 5)).toBeNull()
    expect(incisionQueAlarga(existentes, 'musculo', recta(10, 20, 60), 5)!.id).toBe(3)
  })

  it('un trazo lejos de todas es otra incisión', () => {
    expect(incisionQueAlarga(existentes, 'piel', recta(50, 70, 100), 5)).toBeNull()
  })
})

describe('el rótulo de cada incisión en el panel (P-003 E4.6)', () => {
  it('numera por orden y dice capa, largo y apertura si la hay', () => {
    expect(rotuloDeLaIncision(1, { capa: 'piel', largoMm: 42.4, aperturaMm: 0 })).toBe('Incisión 1 · piel · 42 mm')
    expect(rotuloDeLaIncision(2, { capa: 'musculo', largoMm: 30, aperturaMm: 12.6 })).toBe('Incisión 2 · músculo · 30 mm · abierta 13 mm')
  })
})
