import { describe, expect, it } from 'vitest'
import type { MallaIndexada } from '@/lib/osteotomia'
import {
  partirPorVariosPlanosSinTapa,
  partirSinTapaPorUnPlano,
  recortarSinTapa,
  recortarSinTapaPorUnPlano,
} from '@/lib/recorteDeCapa'

/**
 * Cortar una lámina sin taparla (P-006, F-7).
 *
 * El caso de prueba es un tubo abierto por los dos extremos —un manguito, que es lo que es una fascia—
 * cortado por planos que no caen en un nudo de la malla, para que haya que partir triángulos. Lo que se
 * comprueba es lo que el hueso no necesita: que **no gane tapa**, que las dos mitades sumen la lámina
 * entera, y que dos piezas vecinas compartan el borde.
 */

/** Un tubo de eje Y, radio y largo conocidos, con `n` caras alrededor y `m` anillos. Normales radiales en enteros de 16 bits. */
function tubo(n = 48, m = 40, radio = 0.03, largo = 0.2): MallaIndexada {
  const pos = new Float32Array(n * m * 3)
  const nor = new Int16Array(n * m * 3)
  for (let j = 0; j < m; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * 2 * Math.PI
      const k = (j * n + i) * 3
      pos[k] = radio * Math.cos(a)
      pos[k + 1] = -largo / 2 + (j / (m - 1)) * largo
      pos[k + 2] = radio * Math.sin(a)
      nor[k] = Math.round(Math.cos(a) * 32767)
      nor[k + 2] = Math.round(Math.sin(a) * 32767)
    }
  }
  const idx: number[] = []
  for (let j = 0; j < m - 1; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = j * n + i
      const b = j * n + ((i + 1) % n)
      const c = (j + 1) * n + i
      const d = (j + 1) * n + ((i + 1) % n)
      idx.push(a, c, b, b, c, d)
    }
  }
  return { posiciones: pos, normales: nor, indices: new Uint32Array(idx) }
}

const area = (m: MallaIndexada) => {
  let total = 0
  const p = m.posiciones
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t] * 3, m.indices[t + 1] * 3, m.indices[t + 2] * 3]
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
    const w = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
    total += 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
  }
  return total
}

/** Aristas de borde (de un solo triángulo) y aristas compartidas por más de dos. */
function aristas(m: MallaIndexada) {
  const cuenta = new Map<string, number>()
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = m.indices[t + e]
      const b = m.indices[t + ((e + 1) % 3)]
      const clave = a < b ? `${a}:${b}` : `${b}:${a}`
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
    }
  }
  let borde = 0
  let triples = 0
  for (const v of cuenta.values()) {
    if (v === 1) borde += 1
    if (v > 2) triples += 1
  }
  return { borde, triples }
}

const PLANO_ARRIBA = { punto: [0, 0.0123, 0] as const, normal: [0, 1, 0] as const }
const PLANO_ABAJO = { punto: [0, 0.0123, 0] as const, normal: [0, -1, 0] as const }

describe('recortarSinTapaPorUnPlano', () => {
  it('deja lo que cae del lado de la normal, con el borde exactamente sobre el plano', () => {
    const r = recortarSinTapaPorUnPlano(tubo(), PLANO_ARRIBA)
    let minimo = Infinity
    for (let i = 1; i < r.posiciones.length; i += 3) minimo = Math.min(minimo, r.posiciones[i])
    expect(minimo).toBeGreaterThanOrEqual(0.0123 - 1e-7)
    const enElPlano = [...r.posiciones].filter((_, i) => i % 3 === 1 && Math.abs(r.posiciones[i] - 0.0123) < 1e-6)
    expect(enElPlano.length).toBeGreaterThanOrEqual(48)
  })

  it('no tapa el corte: sigue abierto por los dos extremos y ninguna cara mira a lo largo del eje', () => {
    const n = 48
    const r = recortarSinTapaPorUnPlano(tubo(n), PLANO_ARRIBA)
    const { borde, triples } = aristas(r)
    // El anillo de arriba son n aristas; el del corte pasa por las n verticales y las n diagonales de
    // la malla, que son 2n tramos: 3n en total. Con tapa serían 2n o menos, y habría una cara plana.
    expect(borde).toBe(3 * n)
    expect(triples).toBe(0)
    const p = r.posiciones
    for (let t = 0; t < r.indices.length; t += 3) {
      const [a, b, c] = [r.indices[t] * 3, r.indices[t + 1] * 3, r.indices[t + 2] * 3]
      const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
      const w = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
      const ny = u[2] * w[0] - u[0] * w[2]
      const l = Math.hypot(u[1] * w[2] - u[2] * w[1], ny, u[0] * w[1] - u[1] * w[0]) || 1
      expect(Math.abs(ny / l)).toBeLessThan(0.5)
    }
  })

  it('las dos mitades suman la lámina entera, y comparten el borde', () => {
    const entera = tubo()
    const a = recortarSinTapaPorUnPlano(entera, PLANO_ARRIBA)
    const b = recortarSinTapaPorUnPlano(entera, PLANO_ABAJO)
    expect(area(a) + area(b)).toBeCloseTo(area(entera), 9)

    const borde = (m: MallaIndexada) => {
      const puntos: string[] = []
      for (let i = 0; i < m.posiciones.length; i += 3) {
        if (Math.abs(m.posiciones[i + 1] - 0.0123) < 1e-6) {
          puntos.push([m.posiciones[i], m.posiciones[i + 2]].map((v) => v.toFixed(5)).join(','))
        }
      }
      return puntos.sort()
    }
    expect(borde(a).length).toBeGreaterThan(0)
    expect(borde(a)).toEqual(borde(b))
  })

  it('lo que queda entero dentro es la misma malla, y lo que queda entero fuera sale vacío', () => {
    const entera = tubo()
    expect(recortarSinTapaPorUnPlano(entera, { punto: [0, -1, 0], normal: [0, 1, 0] })).toBe(entera)
    const fuera = recortarSinTapaPorUnPlano(entera, { punto: [0, 1, 0], normal: [0, 1, 0] })
    expect(fuera.indices).toHaveLength(0)
    expect(fuera.posiciones).toHaveLength(0)
  })

  it('conserva el tipo de las normales y las deja unitarias en el corte', () => {
    const enteras = recortarSinTapaPorUnPlano(tubo(), PLANO_ARRIBA)
    expect(enteras.normales).toBeInstanceOf(Int16Array)
    const flotantes = tubo()
    const f = new Float32Array(flotantes.normales.length)
    for (let i = 0; i < f.length; i += 1) f[i] = flotantes.normales[i] / 32767
    const r = recortarSinTapaPorUnPlano({ ...flotantes, normales: f }, PLANO_ARRIBA)
    expect(r.normales).toBeInstanceOf(Float32Array)
    for (let v = 0; v < r.posiciones.length / 3; v += 1) {
      expect(Math.hypot(r.normales[v * 3], r.normales[v * 3 + 1], r.normales[v * 3 + 2])).toBeCloseTo(1, 2)
    }
  })

  it('no admite un plano de normal nula', () => {
    expect(() => recortarSinTapaPorUnPlano(tubo(), { punto: [0, 0, 0], normal: [0, 0, 0] })).toThrow(/normal nula/)
  })
})

describe('recortarSinTapa con varios planos', () => {
  it('deja lo que está del lado bueno de todos', () => {
    const r = recortarSinTapa(tubo(), [PLANO_ARRIBA, { punto: [0.01, 0, 0], normal: [1, -0.3, 0] }])
    const n = [1, -0.3, 0].map((c) => c / Math.hypot(1, 0.3))
    for (let i = 0; i < r.posiciones.length; i += 3) {
      const d = (r.posiciones[i] - 0.01) * n[0] + r.posiciones[i + 1] * n[1]
      expect(d).toBeGreaterThanOrEqual(-1e-6)
      expect(r.posiciones[i + 1]).toBeGreaterThanOrEqual(0.0123 - 1e-6)
    }
  })
})

describe('partirPorVariosPlanosSinTapa', () => {
  const planos = [PLANO_ARRIBA, { punto: [0, 0.07, 0] as const, normal: [0, -1, 0] as const }]

  it('reparte la lámina entre lo de dentro y lo de fuera sin repetir ni perder nada', () => {
    const entera = tubo()
    const p = partirPorVariosPlanosSinTapa(entera, planos)
    expect(p.dentro).not.toBeNull()
    expect(p.fuera).not.toBeNull()
    expect(area(p.dentro!) + area(p.fuera!)).toBeCloseTo(area(entera), 9)
    expect(p.planosQueCortan).toEqual([0, 1])
    // Lo de dentro es la franja entre los dos planos, y sin tapas: abierta por arriba y por abajo.
    const franja = aristas(p.dentro!)
    expect(franja.triples).toBe(0)
    expect(franja.borde).toBeGreaterThan(0)
  })

  it('un plano que no corta nada no cuenta, y uno que deja todo fuera no deja nada dentro', () => {
    const entera = tubo()
    const lejos = { punto: [0, -5, 0] as const, normal: [0, 1, 0] as const }
    const sin = partirPorVariosPlanosSinTapa(entera, [lejos])
    expect(sin.planosQueCortan).toEqual([])
    expect(sin.fuera).toBeNull()
    expect(sin.dentro).toBe(entera)

    const todoFuera = partirPorVariosPlanosSinTapa(entera, [{ punto: [0, 5, 0], normal: [0, 1, 0] }])
    expect(todoFuera.dentro).toBeNull()
    expect(todoFuera.fuera).not.toBeNull()
    expect(area(todoFuera.fuera!)).toBeCloseTo(area(entera), 9)
  })

  it('la partición de un solo plano da las dos mitades', () => {
    const entera = tubo()
    const { haciaLaNormal, contraLaNormal, avisos } = partirSinTapaPorUnPlano(entera, PLANO_ARRIBA)
    expect(area(haciaLaNormal) + area(contraLaNormal)).toBeCloseTo(area(entera), 9)
    expect(avisos).toEqual([])
  })
})
