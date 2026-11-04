import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  esCasiIdentidad,
  matrizDe,
  mejorMovimiento,
  reducirPorLasCarasDeCorte,
  transformacionDe,
  transformacionValida,
  yaEstaEnSuSitio,
  type TrozoParaReducir,
} from '@/lib/reduccionAutomatica'
import { partirMalla, type MallaIndexada } from '@/lib/osteotomia'

/**
 * Un hueso de juguete, en metros: un tubo cerrado de 240 mm con la superficie ondulada, para que sus caras no salgan
 * planas por casualidad como las de un cilindro de libro —en un cilindro liso, cada columna de caras laterales es un
 * plano, y eso no le pasa a ningún hueso—.
 */
function huesoDeJuguete(): MallaIndexada {
  const g = new THREE.CylinderGeometry(0.011, 0.014, 0.24, 22, 14, false)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const angulo = Math.atan2(z, x)
    const onda = 1 + 0.08 * Math.sin(3 * angulo + y * 40) + 0.05 * Math.cos(5 * angulo - y * 25)
    p.setXYZ(i, x * onda, y, z * onda)
  }
  g.computeVertexNormals()
  return {
    posiciones: new Float32Array(p.array),
    normales: new Float32Array(g.getAttribute('normal').array),
    indices: new Uint32Array(g.index!.array),
  }
}

/** Parte el hueso en tres con dos cortes, como el «Recortar» del atlas: proximal, intermedio y distal. */
function tresTrozos() {
  const primero = partirMalla(huesoDeJuguete(), { punto: [0, -0.01, 0], normal: [0.1, 1, 0.05] })
  const segundo = partirMalla(primero.contraLaNormal, { punto: [0, -0.06, 0.002], normal: [0.6, 0.8, 0] })
  return { proximal: primero.haciaLaNormal, intermedio: segundo.haciaLaNormal, distal: segundo.contraLaNormal }
}

const mover = (m: MallaIndexada, movimiento: THREE.Matrix4): Float32Array => {
  const v = new THREE.Vector3()
  const salida = new Float32Array(m.posiciones.length)
  for (let i = 0; i < m.posiciones.length; i += 3) {
    v.set(m.posiciones[i], m.posiciones[i + 1], m.posiciones[i + 2]).applyMatrix4(movimiento)
    salida.set([v.x, v.y, v.z], i)
  }
  return salida
}

const trozo = (nodo: string, m: MallaIndexada, movimiento = new THREE.Matrix4()): TrozoParaReducir => ({
  nodo,
  posiciones: mover(m, movimiento),
  indices: m.indices,
})

const movimiento = (grados: [number, number, number], mm: [number, number, number]) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...mm.map((n) => n / 1000)),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...grados.map((g) => (g * Math.PI) / 180))),
    new THREE.Vector3(1, 1, 1),
  )

/** Lo más que se separa un vértice de donde debería, en milímetros. */
const peorDistanciaMm = (a: Float32Array, b: Float32Array) => {
  let peor = 0
  for (let i = 0; i < a.length; i += 3) peor = Math.max(peor, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]))
  return peor * 1000
}

describe('la reducción automática por las caras de corte (P-008 E5)', () => {
  it('devuelve cada trozo desplazado a su sitio exacto, encadenando los encajes desde el que queda quieto', () => {
    const { proximal, intermedio, distal } = tresTrozos()
    const alIntermedio = movimiento([12, -20, 7], [18, -6, 11])
    const alDistal = movimiento([-9, 15, 25], [-22, 14, 5])
    const resultado = reducirPorLasCarasDeCorte(
      [trozo('proximal', proximal), trozo('intermedio', intermedio, alIntermedio), trozo('distal', distal, alDistal)],
      { milimetrosPorUnidad: 1000 },
    )
    expect(resultado.anclas).toEqual(['proximal'])
    expect(resultado.sueltos).toEqual([])
    expect(resultado.colocados.map((c) => c.nodo).sort()).toEqual(['distal', 'intermedio'])
    // El distal no toca al proximal: se coloca sobre el intermedio, ya colocado.
    expect(resultado.colocados.find((c) => c.nodo === 'distal')!.sobre).toBe('intermedio')
    for (const [nodo, original, desplazado] of [
      ['intermedio', intermedio, alIntermedio],
      ['distal', distal, alDistal],
    ] as const) {
      const c = resultado.colocados.find((x) => x.nodo === nodo)!
      const reducido = mover({ ...original, posiciones: mover(original, desplazado) }, matrizDe(c.transformacion))
      expect(peorDistanciaMm(reducido, original.posiciones)).toBeLessThan(0.001)
      expect(c.errorMm).toBeLessThan(0.001)
      expect(c.vertices).toBeGreaterThan(8)
      expect(yaEstaEnSuSitio(c)).toBe(false)
    }
  })

  it('con el ancla desplazada, los demás se reducen sobre ella, donde esté', () => {
    const { proximal, intermedio, distal } = tresTrozos()
    const alProximal = movimiento([0, 30, 0], [5, 40, -3])
    const alDistal = movimiento([20, 0, -10], [12, 0, 30])
    const resultado = reducirPorLasCarasDeCorte(
      [trozo('proximal', proximal, alProximal), trozo('intermedio', intermedio), trozo('distal', distal, alDistal)],
      { milimetrosPorUnidad: 1000, ancla: 'proximal' },
    )
    for (const [nodo, original, desplazado] of [
      ['intermedio', intermedio, new THREE.Matrix4()],
      ['distal', distal, alDistal],
    ] as const) {
      const c = resultado.colocados.find((x) => x.nodo === nodo)!
      const reducido = mover({ ...original, posiciones: mover(original, desplazado) }, matrizDe(c.transformacion))
      expect(peorDistanciaMm(reducido, mover(original, alProximal))).toBeLessThan(0.001)
    }
  })

  it('se queda quieto el trozo que se pide, aunque no sea el más grande', () => {
    const { proximal, intermedio, distal } = tresTrozos()
    const resultado = reducirPorLasCarasDeCorte(
      [trozo('proximal', proximal), trozo('intermedio', intermedio, movimiento([5, 5, 5], [3, 3, 3])), trozo('distal', distal)],
      { milimetrosPorUnidad: 1000, ancla: 'distal' },
    )
    expect(resultado.anclas).toEqual(['distal'])
    expect(resultado.colocados.find((c) => c.nodo === 'proximal')).toBeDefined()
  })

  it('un modelo que ya viene reducido no mueve nada: es el convenio de D-058', () => {
    const { proximal, intermedio, distal } = tresTrozos()
    const resultado = reducirPorLasCarasDeCorte(
      [trozo('proximal', proximal), trozo('intermedio', intermedio), trozo('distal', distal)],
      { milimetrosPorUnidad: 1000 },
    )
    expect(resultado.colocados).toHaveLength(2)
    expect(resultado.colocados.every(yaEstaEnSuSitio)).toBe(true)
    for (const c of resultado.colocados) expect(esCasiIdentidad(c.transformacion, 1000)).toBe(true)
  })

  it('un objeto sin caras de corte no es un trozo: ni se coloca ni se cuenta como suelto', () => {
    const { proximal, intermedio } = tresTrozos()
    const bola = new THREE.IcosahedronGeometry(0.02, 3)
    const esqueleto: TrozoParaReducir = {
      nodo: 'Esqueleto',
      posiciones: bola.getAttribute('position').array,
      indices: null,
    }
    const resultado = reducirPorLasCarasDeCorte([trozo('proximal', proximal), trozo('intermedio', intermedio, movimiento([3, 0, 0], [4, 0, 0])), esqueleto], {
      milimetrosPorUnidad: 1000,
    })
    expect(resultado.colocados.map((c) => c.nodo)).toEqual(['intermedio'])
    expect(resultado.sueltos).toEqual([])
  })

  it('dos trozos de cortes distintos no encajan entre sí: el que no tiene pareja queda suelto', () => {
    const { proximal, distal } = tresTrozos()
    const resultado = reducirPorLasCarasDeCorte([trozo('proximal', proximal), trozo('distal', distal, movimiento([0, 0, 10], [0, 5, 0]))], {
      milimetrosPorUnidad: 1000,
    })
    expect(resultado.colocados).toEqual([])
    expect(resultado.sueltos.sort()).toEqual(['distal', 'proximal'])
  })
})

describe('el movimiento rígido entre dos nubes de puntos', () => {
  it('recupera un giro y una traslación conocidos, también con todos los puntos en un plano y sin reflejarlos', () => {
    const conocido = movimiento([25, -40, 70], [12, -3, 8])
    const plano = Array.from({ length: 12 }, (_, i) => new THREE.Vector3(Math.cos(i) * 0.02, Math.sin(i * 1.7) * 0.015, 0))
    const destino = plano.map((p) => p.clone().applyMatrix4(conocido))
    const hallado = mejorMovimiento(plano, destino)
    plano.forEach((p, i) => expect(p.clone().applyMatrix4(hallado).distanceTo(destino[i])).toBeLessThan(1e-9))
    expect(hallado.determinant()).toBeCloseTo(1, 9)
  })

  it('la transformación guardada se lee solo si está entera y es un giro', () => {
    const t = transformacionDe(movimiento([10, 20, 30], [1, 2, 3]))
    expect(transformacionValida(t)).toEqual(expect.objectContaining({ x: t.x, y: t.y, z: t.z }))
    expect(transformacionValida({ ...t, qw: null })).toBeNull()
    expect(transformacionValida({ x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 3 })).toBeNull()
    expect(transformacionValida(null)).toBeNull()
    // Lo que viene de la base como texto numérico tampoco: Payload devuelve números.
    expect(transformacionValida({ ...t, x: '1' })).toBeNull()
  })
})
