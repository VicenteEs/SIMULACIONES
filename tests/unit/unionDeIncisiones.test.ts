import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  abrirCapa,
  cadenaDeLaMalla,
  cortarCapa,
  FUNDIDO_JUNTO_A_LA_PUNTA_MM,
  reposoVigente,
  solturaDeLaHerida,
  type HeridaEnCapa,
  type ParametrosDeCorte,
} from '@/components/simulador/heridas'
import { perfilDeLaCapa, puntasDeLaGrieta, puntasDeLosLabios, type PuntasDeLaHerida, type SeparadorColocado } from '@/lib/exposicion'
import { apartadosPorLaOtra, cruceHaciaCadaLabio, husoDeLaGrieta, husoDelLabio, solturaDelLabio, vueltosAntesDeEnderezar } from '@/lib/corteDeMalla'
import { PASADO_DEL_CODO_MM } from '@/lib/incisiones'
import { retraccionDelLabioMm } from '@/lib/retraccionDelCorte'

/**
 * Dos incisiones que se tocan son una sola (D-420), en la malla: el brazo que nace en otra cruza su grieta y queda abierto
 * por ahí, y la esquina se abre sin plegar la piel. Sobre una losa de piel con sus dos caras, en milímetros, como en el
 * navegador pero sin él: las mismas funciones de `heridas.ts` que usa el lienzo.
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

/** Un trazo recto de `a` a `b` sobre la cara de arriba, un punto por milímetro. */
function recta(a: [number, number], b: [number, number]) {
  const largo = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = Math.max(1, Math.round(largo))
  const puntos: THREE.Vector3[] = []
  const normales: THREE.Vector3[] = []
  for (let k = 0; k <= n; k++) {
    puntos.push(new THREE.Vector3(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, 0))
    normales.push(new THREE.Vector3(0, 0, 1))
  }
  return { puntos, normales, largo }
}

const parametros = (incision: number, largo: number, naceDe?: ParametrosDeCorte['naceDe']): ParametrosDeCorte => ({
  profundidad: 14,
  alcance: 30,
  unidadesPorMm: 1,
  incision,
  pared: 6,
  retraccion: retraccionDelLabioMm('piel', largo),
  afinar: 3,
  hondo: false,
  naceDe,
})

const en = (x: number, y: number) => new THREE.Vector3(x, y, 0)

/** Los triángulos de la malla que la apertura dio vuelta: su normal, ahora, contra la que tenían en reposo. */
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

const abrir = (hs: HeridaEnCapa[], mm: number) => {
  for (const h of hs) abrirCapa(h, mm, mm)
}

describe('dos incisiones que se tocan son una sola, también en la malla (D-420)', () => {
  it('cada brazo de la cruz cruza la grieta de la otra y queda abierto por ahí, y nada se pliega', () => {
    const m = losa()
    const A = recta([-46, 0.37], [46, 0.37])
    const hA = cortarCapa(m, A.puntos, A.normales, parametros(1, A.largo))!
    // Cada brazo llega a la línea de la otra y la pasa un milímetro (`PASADO_DE_LA_LINEA_MM`), como los deja el lienzo.
    const b1 = recta([0.41, -30], [0.41, 1.37])
    const hB1 = cortarCapa(m, b1.puntos, b1.normales, parametros(2, b1.largo, [{ incision: 1, punto: en(0.41, 0.37), lado: en(0.41, -15) }]))!
    const b2 = recta([0.41, 30], [0.41, -0.63])
    const hB2 = cortarCapa(m, b2.puntos, b2.normales, parametros(3, b2.largo, [{ incision: 1, punto: en(0.41, 0.37), lado: en(0.41, 15) }]))!
    for (const h of [hB1, hB2]) {
      // La punta de fuera se cierra en la piel, la del cruce no: llega al labio de la otra.
      expect(h.corte.grieta.cerradaAlInicio).toBe(true)
      expect(h.corte.grieta.cerradaAlFinal).toBe(false)
      expect(h.unida).toEqual({ alInicio: false, alFinal: true })
    }
    expect(hA.unida).toBeUndefined()
    expect(vueltos(m)).toBe(0)
    abrir([hA], 6)
    expect(vueltos(m)).toBe(0)
    abrir([hA, hB1, hB2], 6)
    expect(vueltos(m)).toBe(0)
  })

  it('la L: con la incisión pasada de frente, la pierna nace en su grieta y la esquina se abre', () => {
    const m = losa()
    const A = recta([-46, 0.37], [45.41 + PASADO_DEL_CODO_MM, 0.37])
    const hA = cortarCapa(m, A.puntos, A.normales, parametros(1, A.largo))!
    const B = recta([45.41, -0.63], [45.41, 30])
    const hB = cortarCapa(m, B.puntos, B.normales, parametros(2, B.largo, [{ incision: 1, punto: en(45.41, 0.37), lado: en(45.41, 15) }]))!
    expect(hB.corte.grieta.cerradaAlInicio).toBe(false)
    expect(hB.unida).toEqual({ alInicio: true, alFinal: false })
    expect(vueltos(m)).toBe(0)
    abrir([hA, hB], 6)
    expect(vueltos(m)).toBe(0)
  })

  it('la punta del colgajo se retrae por sus dos bordes, y la piel de fuera de la esquina se queda (D-422)', () => {
    const m = losa()
    const A = recta([-46, 0.37], [45.41 + PASADO_DEL_CODO_MM, 0.37])
    const hA = cortarCapa(m, A.puntos, A.normales, parametros(1, A.largo))!
    // Lo que retrae el labio de arriba de la primera, en y, en cada vértice de su cara de fuera.
    const deArriba = () => {
      const reposo = cadenaDeLaMalla(m).at(-1)!.corte.posiciones
      const ahora = (m.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
      return hA.corte.labios.mas.map((v) => ({ x: reposo[3 * v], y: ahora[3 * v + 1] - reposo[3 * v + 1] }))
    }
    const enElMedio = Math.max(...deArriba().filter((p) => Math.abs(p.x) < 5).map((p) => p.y))
    const junto = (lista: { x: number; y: number }[], desde: number, hasta: number) => Math.max(...lista.filter((p) => p.x > desde && p.x < hasta).map((p) => p.y))
    expect(enElMedio).toBeGreaterThan(3)
    // Sola, la primera se cierra hacia su punta: a dos milímetros de donde nacerá la pierna, y a cinco de la punta, se
    // aparta una quinta parte de lo del medio.
    expect(junto(deArriba(), 42.5, 44.5)).toBeLessThan(0.25 * enElMedio)
    const B = recta([45.41, -0.63], [45.41, 30])
    const hB = cortarCapa(m, B.puntos, B.normales, parametros(2, B.largo, [{ incision: 1, punto: en(45.41, 0.37), lado: en(45.41, 15) }]))!
    // La pierna sale hacia el labio «más» de la primera (+y), y el tramo de la primera que va a su inicio (−x) queda del
    // lado «más» de la pierna, que avanza hacia +y: su lateral es z × y = −x.
    expect(hB.colgajos).toHaveLength(1)
    expect(hB.colgajos![0]).toMatchObject({ incision: 1, suyo: 1, inicioDelLado: 1 })
    const ahora = deArriba()
    // Con la pierna, ese labio es el borde del colgajo, y su punta se retrae como el medio de la incisión.
    expect(junto(ahora, 42.5, 44.5)).toBeGreaterThan(0.8 * enElMedio)
    // Al otro lado de la pierna, los 3,5 mm de la pasada son la piel de fuera, que la punta de la primera sujeta.
    expect(junto(ahora, 46, 45.41 + PASADO_DEL_CODO_MM)).toBeLessThan(1.2)
    expect(vueltos(m)).toBe(0)
    abrir([hA, hB], 6)
    expect(vueltos(m)).toBe(0)
  })

  it('sin la pasada, la pierna empezaba en piel sana: las dos puntas cerradas y un puente de piel en la esquina', () => {
    // Lo que se vio en la pierna del caso 3 antes de `PASADO_DEL_CODO_MM`: la grieta de la primera acaba antes que su
    // trazo, en la última arista que partió, y la pierna nacida en la punta del trazo no la alcanza.
    const m = losa()
    const A = recta([-46, 0.37], [45.41, 0.37])
    cortarCapa(m, A.puntos, A.normales, parametros(1, A.largo))
    const B = recta([45.41, -0.63], [45.41, 30])
    const hB = cortarCapa(m, B.puntos, B.normales, parametros(2, B.largo, [{ incision: 1, punto: en(45.41, 0.37), lado: en(45.41, 15) }]))!
    expect(hB.corte.grieta.cerradaAlInicio).toBe(true)
  })
})

describe('la punta del colgajo se redondea (D-423)', () => {
  // Con D-422 la punta se retraía en diagonal, pero entera: seguía en ángulo recto, un poco más atrás. La piel tira de
  // ella desde sus dos bordes libres, y lo que más se retrae es la esquina misma: en pabellón es un arco.

  /** Dónde está ahora cada vértice de un labio, en el plano. */
  const ahoraDe = (m: THREE.Mesh, labio: readonly number[]) => {
    const q = (m.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    return labio.map((v) => ({ x: q[3 * v], y: q[3 * v + 1], z: q[3 * v + 2] }))
  }
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

  /**
   * La esquina de un colgajo cuya punta, en reposo, está en `(px, py)`, con un borde a lo largo de x (hacia `sx`) y el
   * otro a lo largo de y (hacia +y). La esquina «en ángulo recto» es la que darían los dos bordes, rectos, medidos lejos
   * de la punta; el arco tiene su centro a `r` de los dos, hacia dentro del colgajo.
   */
  function esquina(m: THREE.Mesh, aLoLargoDeX: readonly number[], aLoLargoDeY: readonly number[], px: number, py: number, sx: 1 | -1, r: number) {
    const bordeX = ahoraDe(m, aLoLargoDeX).filter((p) => sx * (p.x - px) > 2 * r + 2 && sx * (p.x - px) < 2 * r + 6 && p.z > -0.1)
    const bordeY = ahoraDe(m, aLoLargoDeY).filter((p) => p.y - py > 2 * r + 2 && p.y - py < 2 * r + 6 && p.z > -0.1)
    const recta = { x: media(bordeY.map((p) => p.x)), y: media(bordeX.map((p) => p.y)) }
    const centro = { x: recta.x + sx * r, y: recta.y + r }
    const cerca = [...ahoraDe(m, aLoLargoDeX), ...ahoraDe(m, aLoLargoDeY)].filter(
      (p) => p.z > -0.1 && sx * (p.x - recta.x) > -0.01 && sx * (p.x - centro.x) < 0 && p.y < centro.y && p.y - recta.y > -0.01,
    )
    return {
      // Lo que queda la punta del colgajo de la esquina recta: 0 en ángulo recto, (√2 − 1)·r en el arco.
      retiro: Math.min(...cerca.map((p) => Math.hypot(p.x - recta.x, p.y - recta.y))),
      // Lo que se aparta del arco cada punto del borde dentro de la cometa.
      fueraDelArco: Math.max(...cerca.map((p) => Math.abs(Math.hypot(p.x - centro.x, p.y - centro.y) - r))),
      cuantos: cerca.length,
    }
  }

  /** El radio que pide la retracción de las dos heridas: 1,5 veces la media. */
  const radio = (a: HeridaEnCapa, b: HeridaEnCapa) => (1.5 * (reposoVigente(a) + reposoVigente(b))) / 2

  it('en la L, la punta queda en el arco tangente a sus dos bordes, retirada (√2 − 1)·r de la esquina', () => {
    const m = losa()
    const A = recta([-46, 0.37], [45.41 + PASADO_DEL_CODO_MM, 0.37])
    const hA = cortarCapa(m, A.puntos, A.normales, parametros(1, A.largo))!
    const B = recta([45.41, -0.63], [45.41, 30])
    const hB = cortarCapa(m, B.puntos, B.normales, parametros(2, B.largo, [{ incision: 1, punto: en(45.41, 0.37), lado: en(45.41, 15) }]))!
    const punta = hB.colgajos![0].punta!
    expect(punta.union[0]).toBeCloseTo(45.41, 1)
    expect(punta.tangente[0]).toBeCloseTo(1, 3)
    expect(punta.avance[1]).toBeCloseTo(1, 3)
    const r = radio(hA, hB)
    expect(r).toBeGreaterThan(2)
    // El colgajo: el labio «más» de la primera (+y) y el «más» de la pierna (−x), hacia el inicio de la primera.
    const e = esquina(m, hA.corte.labios.mas, hB.corte.labios.mas, 45.41, 0.37, -1, r)
    expect(e.cuantos).toBeGreaterThan(3)
    expect(e.retiro).toBeGreaterThan(0.33 * r)
    expect(e.retiro).toBeLessThan(0.5 * r)
    expect(e.fueraDelArco).toBeLessThan(0.15 * r)
    expect(vueltos(m)).toBe(0)
    // La pasada de 3,5 mm no es un colgajo: la piel de fuera de la esquina sigue en su sitio, sin arco.
    const fuera = ahoraDe(m, hA.corte.labios.mas).filter((p) => p.x > 46 && p.x < 45.41 + PASADO_DEL_CODO_MM && p.z > -0.1)
    expect(Math.max(...fuera.map((p) => p.y - 0.37))).toBeLessThan(1.2)
    // Abierta con los separadores, el arco viaja con la punta y nada se da la vuelta.
    abrir([hA, hB], 6)
    expect(vueltos(m)).toBe(0)
  })

  it('en la T, las dos puntas de la barra se redondean, una a cada lado del tallo', () => {
    const m = losa()
    const A = recta([-46, 0.37], [46, 0.37])
    const hA = cortarCapa(m, A.puntos, A.normales, parametros(1, A.largo))!
    const B = recta([0.41, -0.63], [0.41, 30])
    const hB = cortarCapa(m, B.puntos, B.normales, parametros(2, B.largo, [{ incision: 1, punto: en(0.41, 0.37), lado: en(0.41, 15) }]))!
    expect(hB.colgajos).toHaveLength(1)
    const r = radio(hA, hB)
    // Del lado −x del tallo, su labio «más»; del +x, el «menos».
    for (const [labio, sx] of [
      [hB.corte.labios.mas, -1],
      [hB.corte.labios.menos, 1],
    ] as const) {
      const e = esquina(m, hA.corte.labios.mas, labio, 0.41, 0.37, sx, r)
      expect(e.cuantos).toBeGreaterThan(3)
      expect(e.retiro).toBeGreaterThan(0.33 * r)
      expect(e.retiro).toBeLessThan(0.5 * r)
      expect(e.fueraDelArco).toBeLessThan(0.15 * r)
    }
    expect(vueltos(m)).toBe(0)
    abrir([hA, hB], 6)
    expect(vueltos(m)).toBe(0)
  })
})

/** Un par de Farabeuf, uno en cada labio, a la fracción `posicion` del trazo y abiertos `mm`. */
const farabeufes = (posicion: number, mm: number): SeparadorColocado[] =>
  ([1, -1] as const).map((lado, k) => ({
    id: Math.round(posicion * 1000) * 2 + k,
    instrumentoId: 'farabeuf',
    nombre: 'Farabeuf',
    tipo: 'mano' as const,
    plano: 'piel' as const,
    lado,
    posicion,
    maximoMm: 40,
    aperturaMm: mm,
  }))

/** Abre una herida con esos separadores, como `aplicarSeparadores` en la escena, con las puntas que se le pidan. */
function abrirCon(h: HeridaEnCapa, separadores: SeparadorColocado[], puntas: (h: HeridaEnCapa) => PuntasDeLaHerida) {
  if (separadores.length === 0) return abrirCapa(h, 0, 0)
  const enMm = perfilDeLaCapa('piel', separadores, [], h.largo, puntas(h))
  let mas = 0
  let menos = 0
  for (let i = 0; i <= 80; i++) {
    const a = enMm(i / 80)
    mas = Math.max(mas, a.mas)
    menos = Math.max(menos, a.menos)
  }
  abrirCapa(h, mas, menos, enMm)
}

describe('la L con un separador en cada brazo (D-420)', () => {
  /** La L de la pierna del caso 3, en la losa: la primera hasta la esquina y pasada de frente, y la pierna hacia arriba. */
  function ele() {
    const m = losa()
    const A = recta([-46, 0.37], [45.41 + PASADO_DEL_CODO_MM, 0.37])
    const hA = cortarCapa(m, A.puntos, A.normales, parametros(1, A.largo))!
    const B = recta([45.41, -0.63], [45.41, 30.37])
    const hB = cortarCapa(m, B.puntos, B.normales, parametros(2, B.largo, [{ incision: 1, punto: en(45.41, 0.37), lado: en(45.41, 15) }]))!
    // Un Farabeuf en la primera a 26 mm de la esquina y otro en el medio de la pierna, los dos a 14 mm.
    const enLaPrimera = farabeufes((45.41 - 26 + 46) / A.largo, 14)
    const enLaPierna = farabeufes(0.5, 14)
    return { m, hA, hB, enLaPrimera, enLaPierna }
  }
  const lasDeAhora = (h: HeridaEnCapa) => puntasDeLosLabios(h.corte.grieta, h.cruces, FUNDIDO_JUNTO_A_LA_PUNTA_MM, h.largo)
  const lasDeAntes = (h: HeridaEnCapa) => puntasDeLaGrieta(h.corte.grieta)

  it('cada labio de la pierna sabe a qué da en la esquina: el de la cuña, a toda la primera; el de fuera, a su punta', () => {
    const { hB } = ele()
    const enLaEsquina = hB.cruces?.alInicio
    expect(enLaEsquina?.mas.partida).toBeCloseTo(91.4, 0)
    expect(enLaEsquina?.menos.partida).toBeCloseTo(2.96, 1)
    expect(hB.cruces?.alFinal).toBeUndefined()
    const soltura = solturaDeLaHerida(hB)!
    expect(soltura.mas.alInicio).toBe(1)
    expect(soltura.menos.alInicio).toBeGreaterThan(0.1)
    expect(soltura.menos.alInicio).toBeLessThan(0.35)
    expect(soltura.mas.alFinal).toBe(1)
  })

  it('con un Farabeuf en cada brazo, la cuña de dentro no se da la vuelta', () => {
    const { m, hA, hB, enLaPrimera, enLaPierna } = ele()
    expect(vueltos(m)).toBe(0)
    // Cada uno solo, ninguno; los dos juntos, casi ninguno, junto a la punta de la primera, y esos los endereza
    // `componerCortes` (D-421). Lo que se ve está enderezado, así que lo que da vuelta el arrastre se cuenta antes.
    const antesDeEnderezar = () => vueltosAntesDeEnderezar(cadenaDeLaMalla(m).at(-1)!.corte)
    abrirCon(hA, enLaPrimera, lasDeAhora)
    abrirCon(hB, [], lasDeAhora)
    expect(vueltos(m)).toBe(0)
    abrirCon(hA, [], lasDeAhora)
    abrirCon(hB, enLaPierna, lasDeAhora)
    expect(vueltos(m)).toBe(0)
    abrirCon(hA, enLaPrimera, lasDeAhora)
    abrirCon(hB, enLaPierna, lasDeAhora)
    expect(antesDeEnderezar()).toBeLessThanOrEqual(12)
    expect(vueltos(m)).toBe(0)
    // Con la cuerda de la pierna anclada en la punta del trazo, como hasta ahora, la cuña se doblaba entera. Enderezada
    // no se ve vuelta, sino aplastada a una quinta parte de su área.
    abrirCon(hB, enLaPierna, lasDeAntes)
    expect(antesDeEnderezar()).toBeGreaterThan(100)
  })

})

describe('lo suelto y lo sujeto junto al cruce (D-420)', () => {
  it('lo suelto crece de 0 en la punta de la otra a 1 a todo el fundido, y sin punta es 1', () => {
    expect(solturaDelLabio(0, 10)).toBe(0)
    expect(solturaDelLabio(5, 10)).toBeCloseTo(0.5, 6)
    expect(solturaDelLabio(12, 10)).toBe(1)
    expect(solturaDelLabio(Infinity, 10)).toBe(1)
  })

  it('el huso de un labio sujeto se cierra en el extremo abierto como en una punta; suelto, es el de la grieta', () => {
    const grieta = { desde: 0.05, hasta: 0.95, cerradaAlInicio: false, cerradaAlFinal: true }
    for (const t of [0.05, 0.2, 0.5, 0.9]) expect(husoDelLabio(grieta, t, 0.3, { alInicio: 1, alFinal: 1 })).toBe(husoDeLaGrieta(grieta, t, 0.3))
    expect(husoDeLaGrieta(grieta, 0.05, 0.3)).toBe(1)
    expect(husoDelLabio(grieta, 0.05, 0.3, { alInicio: 0, alFinal: 1 })).toBe(0)
    expect(husoDelLabio(grieta, 0.05, 0.3, { alInicio: 0.25, alFinal: 1 })).toBeCloseTo(0.25, 6)
    // Lejos del cruce, el huso es el mismo sujeto o suelto.
    expect(husoDelLabio(grieta, 0.5, 0.3, { alInicio: 0, alFinal: 1 })).toBeCloseTo(husoDeLaGrieta(grieta, 0.5, 0.3), 6)
  })

  it('cada labio de la pierna de la L da a su lado de la primera, y el que se inclina hacia el otro lado deja piel detrás', () => {
    const m = losa()
    const A = recta([-46, 0.37], [45.41 + PASADO_DEL_CODO_MM, 0.37])
    const hA = cortarCapa(m, A.puntos, A.normales, parametros(1, A.largo))!
    // La pierna sale hacia arriba: su labio «más», a la izquierda de quien traza, da al resto de la primera.
    const deFrente = cruceHaciaCadaLabio(hA.corte, [45.41, 0.37, 0], [-1, 0, 0], [0, 1, 0])
    expect(deFrente.mas.partida).toBeCloseTo(91.4, 0)
    expect(deFrente.menos.partida).toBeCloseTo(2.96, 1)
    expect(deFrente.mas.detras).toBeCloseTo(0, 6)
    expect(deFrente.menos.detras).toBeCloseTo(0, 6)
    // A 45° hacia la punta de la primera: detrás de su arranque, del lado de la cuña, queda piel.
    const enSesgo = cruceHaciaCadaLabio(hA.corte, [45.41, 0.37, 0], [-Math.SQRT1_2, Math.SQRT1_2, 0], [Math.SQRT1_2, Math.SQRT1_2, 0])
    expect(enSesgo.mas.detras).toBeCloseTo(Math.SQRT1_2, 3)
    expect(enSesgo.menos.detras).toBe(0)
  })

  it('lo de enfrente bajo la esquina se suelta del lado de la cuña y se queda unido del de la punta de la primera', () => {
    const m = losa()
    const A = recta([-46, 0.37], [45.41 + PASADO_DEL_CODO_MM, 0.37])
    const hA = cortarCapa(m, A.puntos, A.normales, parametros(1, A.largo))!
    // Dos puntos bajo la esquina, uno a cada lado de la pierna, del lado de enfrente de la primera.
    const puntos = Float32Array.from([44, -3, 0, 47, -3, 0])
    const lado = Int8Array.from([-1, -1])
    const cruce = { punto: [45.41, 0.37, 0] as [number, number, number], lateral: [-1, 0, 0] as [number, number, number] }
    const conElLado = apartadosPorLaOtra(puntos, lado, hA.corte, 1, FUNDIDO_JUNTO_A_LA_PUNTA_MM, cruce)
    expect(conElLado[0]).toBe(1)
    expect(conElLado[1]).toBeLessThan(0.1)
    // Sin el lado de la pierna, los dos miraban la punta más cercana: el de la cuña quedaba unido a medias, y la pierna
    // lo arrastraba hacia la cuña.
    const sinElLado = apartadosPorLaOtra(puntos, lado, hA.corte, 1, FUNDIDO_JUNTO_A_LA_PUNTA_MM)
    expect(sinElLado[0]).toBeGreaterThan(0.2)
    expect(sinElLado[0]).toBeLessThan(0.6)
  })
})
