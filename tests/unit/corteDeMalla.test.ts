import { describe, expect, it } from 'vitest'
import {
  abrirHerida,
  cortarMalla,
  largoDeLaHerida,
  proyectar,
  prepararIncision,
  type IncisionSobreLaMalla,
  type MallaPlana,
  type Vec3,
} from '@/lib/corteDeMalla'

/**
 * El corte de mallas de partes blandas (D-167).
 *
 * Se prueba sobre una malla plana de 21 × 21 vértices —una «piel» de 20 mm de
 * lado— y sobre un tubo, que es lo que de verdad es una pierna: el corte de
 * arriba no puede abrir la piel de abajo.
 */

function rejilla(n: number, lado: number, z = 0): MallaPlana {
  const posiciones = new Float32Array(n * n * 3)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = 3 * (j * n + i)
      posiciones[k] = (i * lado) / (n - 1)
      posiciones[k + 1] = (j * lado) / (n - 1)
      posiciones[k + 2] = z
    }
  }
  const indices: number[] = []
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices.push(a, b, d, a, d, c)
    }
  }
  return { posiciones, indices: Uint32Array.from(indices) }
}

const area = (m: MallaPlana, posiciones = m.posiciones) => {
  let total = 0
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [
      posiciones[3 * i],
      posiciones[3 * i + 1],
      posiciones[3 * i + 2],
    ])
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    total += 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
  }
  return total
}

/** Aristas que pertenecen a un solo triángulo: el borde de la malla, y la grieta. */
const aristasDeBorde = (m: MallaPlana) => {
  const cuenta = new Map<string, number>()
  for (let t = 0; t < m.indices.length; t += 3) {
    for (const [x, y] of [
      [m.indices[t], m.indices[t + 1]],
      [m.indices[t + 1], m.indices[t + 2]],
      [m.indices[t + 2], m.indices[t]],
    ]) {
      const clave = x < y ? `${x}-${y}` : `${y}-${x}`
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
    }
  }
  return [...cuenta.values()].filter((v) => v === 1).length
}

const incisionRecta = (de: number, a: number, y: number): IncisionSobreLaMalla => {
  const puntos: Vec3[] = []
  const normales: Vec3[] = []
  for (let x = de; x <= a + 1e-9; x += 0.5) {
    puntos.push([x, y, 0])
    normales.push([0, 0, 1])
  }
  return { puntos, normales }
}

const OPCIONES = { profundidad: 4, alcance: 6, holgura: 4 }

describe('proyectar: dónde cae un punto respecto de la incisión', () => {
  const curva = prepararIncision(incisionRecta(5, 15, 10.3), 0.01)!

  it('da el lado y la distancia lateral', () => {
    const arriba = proyectar(curva, [10, 12.3, 0])
    const abajo = proyectar(curva, [10, 8.3, 0])
    expect(arriba.lateral).toBeCloseTo(2, 5)
    expect(abajo.lateral).toBeCloseTo(-2, 5)
    expect(arriba.t).toBeCloseTo(0.5, 2)
  })

  it('no considera «dentro» lo que queda antes del inicio o después del final', () => {
    expect(proyectar(curva, [2, 10.3, 0]).dentro).toBe(false)
    expect(proyectar(curva, [18, 10.3, 0]).dentro).toBe(false)
    expect(proyectar(curva, [8, 10.3, 0]).dentro).toBe(true)
  })

  it('mide la altura sobre la superficie', () => {
    expect(proyectar(curva, [10, 10.3, -3]).altura).toBeCloseTo(-3, 5)
  })
})

describe('cortarMalla', () => {
  const malla = rejilla(21, 20)

  it('una incisión que no toca la malla no la corta', () => {
    expect(cortarMalla(malla, incisionRecta(30, 40, 10.3), OPCIONES)).toBeNull()
  })

  it('conserva el área: el corte solo reparte la superficie, no la pierde', () => {
    const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!
    expect(corte).not.toBeNull()
    expect(area(corte, corte.posiciones)).toBeCloseTo(area(malla), 4)
  })

  it('abre una grieta: aparecen aristas de borde a lo largo de la herida', () => {
    const antes = aristasDeBorde(malla)
    const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!
    const despues = aristasDeBorde(corte)
    // La grieta tiene dos labios: cada tramo suma una arista por lado.
    expect(despues).toBeGreaterThan(antes + 8)
    expect(corte.labios.mas.length).toBeGreaterThanOrEqual(6)
    expect(corte.labios.mas.length).toBe(corte.labios.menos.length)
  })

  it('cada vértice de la herida se duplica: un labio por lado, en el mismo sitio', () => {
    const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!
    const [i, j] = [corte.labios.mas[2], corte.labios.menos[2]]
    expect(i).not.toBe(j)
    for (let k = 0; k < 3; k++) expect(corte.posiciones[3 * i + k]).toBeCloseTo(corte.posiciones[3 * j + k], 6)
  })

  it('no deja triángulos degenerados ni números rotos', () => {
    const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!
    expect([...corte.posiciones].every(Number.isFinite)).toBe(true)
    let minimo = Infinity
    for (let t = 0; t < corte.indices.length; t += 3) {
      const una = rejilla(2, 1)
      una.indices = Uint32Array.from([corte.indices[t], corte.indices[t + 1], corte.indices[t + 2]])
      minimo = Math.min(minimo, area({ ...una, posiciones: corte.posiciones }, corte.posiciones))
    }
    // Ninguna esquirla de área casi nula (el corte se aleja un 5 % de los vértices).
    expect(minimo).toBeGreaterThan(1e-3)
  })

  it('la herida acaba antes del borde de la malla: las puntas no se desgarran', () => {
    const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!
    // Ni el primero ni el último vértice del labio llegan a los extremos de la incisión.
    const xs = corte.labios.mas.map((i) => corte.posiciones[3 * i])
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(5 - 1)
    expect(Math.max(...xs)).toBeLessThanOrEqual(15 + 1)
  })

  it('una incisión curva también se corta, y sigue conservando el área', () => {
    const puntos: Vec3[] = []
    const normales: Vec3[] = []
    for (let a = 0; a <= 1; a += 0.04) {
      puntos.push([4 + a * 12, 10 + 3 * Math.sin(a * Math.PI), 0])
      normales.push([0, 0, 1])
    }
    const corte = cortarMalla(malla, { puntos, normales }, OPCIONES)!
    expect(corte).not.toBeNull()
    expect(area(corte, corte.posiciones)).toBeCloseTo(area(malla), 3)
    expect(corte.labios.mas.length).toBeGreaterThan(6)
  })
})

describe('abrirHerida', () => {
  const malla = rejilla(21, 20)
  const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!

  it('en reposo, no mueve nada', () => {
    const quieta = abrirHerida(corte, 0, 0)
    expect([...quieta]).toEqual([...corte.posiciones])
  })

  it('separa los dos labios tanto como se pide en el centro de la herida', () => {
    const abierta = abrirHerida(corte, 2, 2)
    const medio = Math.floor(corte.labios.mas.length / 2)
    const [i, j] = [corte.labios.mas[medio], corte.labios.menos[medio]]
    const separacion = Math.hypot(
      abierta[3 * i] - abierta[3 * j],
      abierta[3 * i + 1] - abierta[3 * j + 1],
      abierta[3 * i + 2] - abierta[3 * j + 2],
    )
    // El peso en el centro de una herida de 10 mm es 1: la separación es la suma de los dos labios.
    expect(separacion).toBeGreaterThan(3.2)
    expect(separacion).toBeLessThanOrEqual(4.0001)
  })

  it('un solo labio se mueve si solo se separa uno (un Farabeuf sostiene un borde)', () => {
    const abierta = abrirHerida(corte, 3, 0)
    const medio = Math.floor(corte.labios.mas.length / 2)
    const [i, j] = [corte.labios.mas[medio], corte.labios.menos[medio]]
    expect(Math.hypot(abierta[3 * j] - corte.posiciones[3 * j], abierta[3 * j + 1] - corte.posiciones[3 * j + 1])).toBeCloseTo(0, 6)
    expect(Math.abs(abierta[3 * i + 1] - corte.posiciones[3 * i + 1])).toBeGreaterThan(2)
  })

  it('el tejido lejano de la herida no se entera', () => {
    const abierta = abrirHerida(corte, 4, 4)
    // El vértice de la esquina (0,0) está a más de 10 mm del corte: no se mueve.
    expect(abierta[0]).toBe(corte.posiciones[0])
    expect(abierta[1]).toBe(corte.posiciones[1])
  })

  it('al abrir, ningún triángulo se da la vuelta', () => {
    const abierta = abrirHerida(corte, 3, 3)
    let invertidos = 0
    for (let t = 0; t < corte.indices.length; t += 3) {
      const [a, b, c] = [corte.indices[t], corte.indices[t + 1], corte.indices[t + 2]]
      const orientacion = (p: Float32Array) =>
        (p[3 * b] - p[3 * a]) * (p[3 * c + 1] - p[3 * a + 1]) - (p[3 * b + 1] - p[3 * a + 1]) * (p[3 * c] - p[3 * a])
      if (orientacion(corte.posiciones) > 0 && orientacion(abierta) < 0) invertidos++
    }
    expect(invertidos).toBe(0)
  })
})

describe('un tubo cerrado, como una pierna', () => {
  /** Un cilindro de radio 10 y 40 de largo; la incisión va por arriba (y = +radio). */
  function tubo(): MallaPlana {
    const segmentosAngulo = 48
    const segmentosLargo = 40
    const posiciones: number[] = []
    for (let j = 0; j <= segmentosLargo; j++) {
      for (let i = 0; i < segmentosAngulo; i++) {
        const a = (i / segmentosAngulo) * Math.PI * 2
        posiciones.push((j * 40) / segmentosLargo, 10 * Math.sin(a), 10 * Math.cos(a))
      }
    }
    const indices: number[] = []
    for (let j = 0; j < segmentosLargo; j++) {
      for (let i = 0; i < segmentosAngulo; i++) {
        const a = j * segmentosAngulo + i
        const b = j * segmentosAngulo + ((i + 1) % segmentosAngulo)
        const c = a + segmentosAngulo
        const d = b + segmentosAngulo
        indices.push(a, c, b, b, c, d)
      }
    }
    return { posiciones: Float32Array.from(posiciones), indices: Uint32Array.from(indices) }
  }

  it('el corte de arriba no abre la piel de abajo', () => {
    const malla = tubo()
    // Incisión sobre z = +10 (la generatriz de arriba), de x = 10 a x = 30, con la normal hacia fuera (+z).
    const puntos: Vec3[] = []
    const normales: Vec3[] = []
    for (let x = 10; x <= 30; x += 1) {
      puntos.push([x, 0.37, 9.993])
      normales.push([0, 0.037, 1])
    }
    const corte = cortarMalla(malla, { puntos, normales }, { profundidad: 3, alcance: 8, holgura: 4 })!
    expect(corte).not.toBeNull()
    // Todos los vértices duplicados están en la cara de arriba (z > 5): ninguno en la de abajo.
    for (const i of [...corte.labios.mas, ...corte.labios.menos]) expect(corte.posiciones[3 * i + 2]).toBeGreaterThan(5)
    // Y la piel de abajo no se mueve al abrir.
    const abierta = abrirHerida(corte, 4, 4)
    for (let i = 0; i < corte.lado.length; i++) {
      if (corte.posiciones[3 * i + 2] < -5) {
        expect(abierta[3 * i]).toBe(corte.posiciones[3 * i])
        expect(abierta[3 * i + 1]).toBe(corte.posiciones[3 * i + 1])
      }
    }
  })
})

describe('largoDeLaHerida', () => {
  it('mide la incisión', () => {
    expect(largoDeLaHerida(incisionRecta(5, 15, 10))).toBeCloseTo(10, 5)
  })
})
