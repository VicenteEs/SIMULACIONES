import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { abrirCapa, cadenaDeLaMalla, cortarCapa, type HeridaEnCapa, type ParametrosDeCorte } from '@/components/simulador/heridas'
import { arrugasDeLaPiel, ESTIRADA_PREVIA_DE_LA_PIEL, ONDA_DE_LAS_ARRUGAS_MM, retraccionDelLabioMm } from '@/lib/retraccionDelCorte'

/**
 * La piel que un separador aprieta detrás del labio se arruga (D-423). Hasta entonces lo apretado se quedaba liso, y el
 * borde parecía de goma. Sobre una losa de piel de 120 mm con sus dos caras, en milímetros, cortada a lo largo de x.
 */

const MITAD = 60
const PASO = 2
const GROSOR = 4

/** Una cara de la losa, a la altura `z`: una rejilla en zigzag, con las caras hacia fuera. */
function cara(z: number, alReves: boolean) {
  const n = Math.round((2 * MITAD) / PASO) + 1
  const posiciones: number[] = []
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) posiciones.push(-MITAD + i * PASO, -MITAD + j * PASO, z)
  const indices: number[] = []
  const v = (i: number, j: number) => j * n + i
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const t =
        (i + j) % 2 === 0
          ? [v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i, j + 1)]
          : [v(i, j), v(i + 1, j), v(i, j + 1), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)]
      if (alReves) for (let k = 0; k < t.length; k += 3) indices.push(t[k], t[k + 2], t[k + 1])
      else indices.push(...t)
    }
  return { posiciones, indices }
}

function losa(): THREE.Mesh {
  const a = cara(0, false)
  const b = cara(-GROSOR, true)
  const desde = a.posiciones.length / 3
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from([...a.posiciones, ...b.posiciones]), 3))
  g.setIndex([...a.indices, ...b.indices.map((i) => i + desde)])
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
  m.name = 'Piel'
  m.updateMatrixWorld(true)
  return m
}

/** Una incisión de 80 mm a lo largo de x, con el arrastre de la piel del lienzo (45 mm). */
function cortada(cruzaLaTension: number | undefined): { m: THREE.Mesh; h: HeridaEnCapa } {
  const m = losa()
  const puntos: THREE.Vector3[] = []
  const normales: THREE.Vector3[] = []
  for (let x = -40; x <= 40; x++) {
    puntos.push(new THREE.Vector3(x, 0.37, 0))
    normales.push(new THREE.Vector3(0, 0, 1))
  }
  const parametros: ParametrosDeCorte = {
    profundidad: 14,
    alcance: 30,
    arrastre: 45,
    unidadesPorMm: 1,
    incision: 1,
    pared: 6,
    retraccion: retraccionDelLabioMm('piel', 80, cruzaLaTension ?? 0),
    afinar: 3,
    hondo: false,
    cruzaLaTension,
  }
  return { m, h: cortarCapa(m, puntos, normales, parametros)! }
}

/**
 * Lo que se alzó cada vértice de una cara, en z, contra su reposo, en la franja |x| < 6 del medio de la incisión y del
 * lado +y: la arruga vista de perfil, ordenada por lo lejos que queda del corte.
 */
function perfilDeLaArruga(m: THREE.Mesh, cara: 'fuera' | 'dentro') {
  const reposo = cadenaDeLaMalla(m).at(-1)!.corte.posiciones
  const ahora = (m.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
  const salida: { y: number; x: number; alza: number }[] = []
  for (let v = 0; v < reposo.length / 3; v++) {
    const z = reposo[3 * v + 2]
    if (cara === 'fuera' ? Math.abs(z) > 0.01 : Math.abs(z + GROSOR) > 0.01) continue
    const x = reposo[3 * v]
    const y = reposo[3 * v + 1]
    if (Math.abs(x) > 6 || y < 0.5) continue
    salida.push({ x, y, alza: ahora[3 * v + 2] - z })
  }
  return salida.sort((p, q) => p.y - q.y)
}

/** Los triángulos que la apertura dio vuelta. */
function vueltos(m: THREE.Mesh): number {
  const ultima = cadenaDeLaMalla(m).at(-1)!
  const reposo = ultima.corte.posiciones
  const ahora = (m.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
  const indices = ultima.corte.indices
  const normal = (q: ArrayLike<number>, a: number, b: number, c: number) => {
    const u = [0, 1, 2].map((k) => q[3 * b + k] - q[3 * a + k])
    const w = [0, 1, 2].map((k) => q[3 * c + k] - q[3 * a + k])
    return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
  }
  let total = 0
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
    const n0 = normal(reposo, a, b, c)
    const n1 = normal(ahora, a, b, c)
    if (Math.hypot(...n0) / 2 < 1e-6) continue
    if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0) total++
  }
  return total
}

const cresta = (perfil: { y: number; alza: number }[]) => perfil.reduce((a, b) => (b.alza > a.alza ? b : a))

describe('la piel apretada detrás del labio se arruga (D-423)', () => {
  it('lo que la piel aguanta sin arrugarse va del 10 % (corte a lo largo de sus líneas) al 23 % (de través)', () => {
    expect(arrugasDeLaPiel(0)).toEqual({ ondaMm: ONDA_DE_LAS_ARRUGAS_MM, estiradaPrevia: ESTIRADA_PREVIA_DE_LA_PIEL.aTraves })
    expect(arrugasDeLaPiel(1).estiradaPrevia).toBeCloseTo(ESTIRADA_PREVIA_DE_LA_PIEL.aLoLargo, 9)
    expect(arrugasDeLaPiel(0.5).estiradaPrevia).toBeCloseTo(0.165, 9)
  })

  it('recién cortada, sin nada que tire, se retrae y no se arruga: solo devuelve lo estirado', () => {
    const { m, h } = cortada(0)
    expect(h.arrugas).toBeDefined()
    expect(Math.max(...perfilDeLaArruga(m, 'fuera').map((p) => Math.abs(p.alza)))).toBeLessThan(1e-3)
  })

  it('tirada 12 mm, se levanta un rodete paralelo al corte, a media onda del labio, con las dos caras a la vez', () => {
    const { m, h } = cortada(0)
    abrirCapa(h, 12, 12)
    const fuera = perfilDeLaArruga(m, 'fuera')
    const alta = cresta(fuera)
    // Entre uno y cinco milímetros de alto, y a media onda del labio (10 mm), donde lo apretado es más.
    expect(alta.alza).toBeGreaterThan(1)
    expect(alta.alza).toBeLessThanOrEqual(ONDA_DE_LAS_ARRUGAS_MM / 4 + 1e-6)
    expect(alta.y).toBeGreaterThan(6)
    expect(alta.y).toBeLessThan(14)
    // Nace plana en el labio, y solo sube: se dobla hacia fuera, no se hunde en la grasa.
    expect(Math.max(...fuera.filter((p) => p.y < 2.5).map((p) => p.alza))).toBeLessThan(0.15 * alta.alza)
    expect(Math.min(...fuera.map((p) => p.alza))).toBeGreaterThan(-1e-3)
    // A una onda del labio vuelve al valle, y pasado el alcance del arrastre la piel sigue lisa.
    expect(Math.max(...fuera.filter((p) => Math.abs(p.y - ONDA_DE_LAS_ARRUGAS_MM) < 1.1).map((p) => p.alza))).toBeLessThan(0.2 * alta.alza)
    expect(Math.max(...fuera.filter((p) => p.y > 46).map((p) => Math.abs(p.alza)))).toBeLessThan(1e-3)
    // Las crestas son paralelas al corte: a 5 mm a cada lado del medio, a la misma distancia del labio.
    const izquierda = cresta(fuera.filter((p) => p.x < -4))
    const derecha = cresta(fuera.filter((p) => p.x > 4))
    expect(Math.abs(izquierda.y - derecha.y)).toBeLessThan(2.1)
    // Y la cara de dentro sube con la de fuera: una arruga alza el grosor entero.
    const dentro = cresta(perfilDeLaArruga(m, 'dentro'))
    expect(dentro.alza).toBeCloseTo(alta.alza, 0)
    expect(vueltos(m)).toBe(0)
  })

  it('cuanto más tira, más alto, y con 3 mm todavía no pasa de lo estirado', () => {
    const { m, h } = cortada(0)
    const alto = (mm: number) => {
      abrirCapa(h, mm, mm)
      return cresta(perfilDeLaArruga(m, 'fuera')).alza
    }
    expect(alto(3)).toBeLessThan(1e-3)
    const ocho = alto(8)
    const doce = alto(12)
    expect(ocho).toBeGreaterThan(0.3)
    expect(doce).toBeGreaterThan(ocho)
  })

  it('un corte de través aprieta la piel a lo largo de sus líneas, más estirada: se arruga menos', () => {
    const aLoLargo = cortada(0)
    const deTraves = cortada(1)
    abrirCapa(aLoLargo.h, 12, 12)
    abrirCapa(deTraves.h, 12, 12)
    expect(cresta(perfilDeLaArruga(deTraves.m, 'fuera')).alza).toBeLessThan(0.85 * cresta(perfilDeLaArruga(aLoLargo.m, 'fuera')).alza)
  })

  it('lo de debajo de la piel, o un corte sin la tensión de la piel, no se arruga', () => {
    const { m, h } = cortada(undefined)
    expect(h.arrugas).toBeUndefined()
    abrirCapa(h, 12, 12)
    expect(Math.max(...perfilDeLaArruga(m, 'fuera').map((p) => Math.abs(p.alza)))).toBeLessThan(1e-3)
  })
})
