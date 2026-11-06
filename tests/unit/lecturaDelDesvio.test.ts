import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { anguloDelGiro, lecturaDelDesvio, type EjesClinicos } from '@/atlas/lecturaClinica'
import {
  aplicarLa,
  componer,
  delTaller,
  enUnMarcoCorrido,
  esCasiIdentidad,
  girarConLa,
  IDENTIDAD,
  invertir,
  type TransformacionRigida,
} from '@/lib/transformacionRigida'
import {
  desvioDelFragmento,
  ejesDelFragmento,
  ladoPorElNombre,
  trozoDelFragmento,
} from '@/components/simulador/reduccionEnLaEscena'

/**
 * La reducción se lee como en clínica (D-303, E1 de P-012).
 *
 * Antes la consola restaba ángulos de Euler eje por eje y sumaba los tres en una «angulación»: daba el giro de verdad
 * solo si el trozo empezaba sin girar, y no decía si era varo, recurvatum o rotación. Aquí se prueba la cuenta que la
 * sustituye con giros hechos a propósito —un plano cada vez—, en las dos piernas y con el trozo distal y el proximal, y
 * el caso que confundía la resta: un trozo que parte girado.
 *
 * Los ejes son los del atlas de pie: el largo de proximal a distal hacia abajo, delante +z, y fuera −x en la pierna
 * derecha, que en el atlas está en x negativa, y +x en la izquierda.
 */

const radianes = (g: number) => (g * Math.PI) / 180

/** Un giro de `angulo` grados alrededor de `eje`, como cuaternión [x, y, z, w]. */
function giro(eje: [number, number, number], angulo: number): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...eje).normalize(), radianes(angulo))
  return [q.x, q.y, q.z, q.w]
}

const DERECHA: EjesClinicos = { largo: [0, -1, 0], delante: [0, 0, 1], fuera: [-1, 0, 0] }
const IZQUIERDA: EjesClinicos = { largo: [0, -1, 0], delante: [0, 0, 1], fuera: [1, 0, 0] }
const QUIETO: [number, number, number] = [0, 0, 0]

describe('lecturaDelDesvio: un plano cada vez', () => {
  it('un varo puro es solo varo: ni recurvatum ni rotación', () => {
    // En la pierna derecha, girar 8° sobre +z lleva el extremo distal hacia +x, que ahí es medial.
    const l = lecturaDelDesvio({ giro: giro([0, 0, 1], 8), separacionMm: QUIETO }, DERECHA)
    expect(l.valgo).toBeCloseTo(-8, 6)
    expect(l.recurvatum).toBeCloseTo(0, 6)
    expect(l.rotacion).toBeCloseTo(0, 6)
  })

  it('un recurvatum puro es solo recurvatum, y no depende del lado', () => {
    // −6° sobre +x lleva el extremo distal hacia delante: recurvatum, ápice posterior.
    for (const ejes of [DERECHA, IZQUIERDA]) {
      const l = lecturaDelDesvio({ giro: giro([1, 0, 0], -6), separacionMm: QUIETO }, ejes)
      expect(l.recurvatum).toBeCloseTo(6, 6)
      expect(l.valgo).toBeCloseTo(0, 6)
      expect(l.rotacion).toBeCloseTo(0, 6)
    }
  })

  it('una rotación pura es solo rotación, y es externa cuando la cara anterior se va hacia fuera', () => {
    const q = giro([0, -1, 0], 12)
    const l = lecturaDelDesvio({ giro: q, separacionMm: QUIETO }, DERECHA)
    expect(l.rotacion).toBeCloseTo(12, 6)
    expect(l.valgo).toBeCloseTo(0, 6)
    expect(l.recurvatum).toBeCloseTo(0, 6)
    // La comprobación de la palabra, sin fiarse del signo escrito: la cara anterior girada apunta hacia fuera.
    const anterior = girarConLa({ qx: q[0], qy: q[1], qz: q[2], qw: q[3] }, DERECHA.delante)
    const haciaFuera = anterior[0] * DERECHA.fuera[0] + anterior[1] * DERECHA.fuera[1] + anterior[2] * DERECHA.fuera[2]
    expect(haciaFuera).toBeGreaterThan(0)
  })

  it('el mismo giro del trozo es valgo en una pierna y varo en la otra, con la misma cifra', () => {
    const q = giro([0, 0, 1], 8)
    expect(lecturaDelDesvio({ giro: q, separacionMm: QUIETO }, DERECHA).valgo).toBeCloseTo(-8, 6)
    expect(lecturaDelDesvio({ giro: q, separacionMm: QUIETO }, IZQUIERDA).valgo).toBeCloseTo(8, 6)
    // Y la rotación, igual: la mano derecha sobre el largo es externa en un lado e interna en el otro.
    const r = giro([0, -1, 0], 12)
    expect(lecturaDelDesvio({ giro: r, separacionMm: QUIETO }, IZQUIERDA).rotacion).toBeCloseTo(-12, 6)
  })

  it('la traslación con su signo: lateral, anterior y, a lo largo, diástasis o acortamiento', () => {
    const l = lecturaDelDesvio({ giro: [0, 0, 0, 1], separacionMm: [-3, 0, 2] }, DERECHA)
    expect(l.lateral).toBeCloseTo(3, 9)
    expect(l.anteroposterior).toBeCloseTo(2, 9)
    // El distal que baja se separa del proximal; el que sube cabalga sobre él.
    expect(lecturaDelDesvio({ giro: [0, 0, 0, 1], separacionMm: [0, -4, 0] }, DERECHA).axial).toBeCloseTo(4, 9)
    expect(lecturaDelDesvio({ giro: [0, 0, 0, 1], separacionMm: [0, 2, 0] }, DERECHA).axial).toBeCloseTo(-2, 9)
  })

  it('si el que se mueve es el proximal, se lee el distal visto desde él', () => {
    // El proximal que gira 8° hacia un lado deja al distal, visto desde él, 8° hacia el otro.
    const varoDelProximal = lecturaDelDesvio({ giro: giro([0, 0, 1], 8), separacionMm: QUIETO }, DERECHA, 'proximal')
    expect(varoDelProximal.valgo).toBeCloseTo(8, 6)
    // Y el proximal que se va 3 mm hacia fuera deja al distal 3 mm hacia dentro.
    const corrido = lecturaDelDesvio({ giro: [0, 0, 0, 1], separacionMm: [-3, 0, 0] }, DERECHA, 'proximal')
    expect(corrido.lateral).toBeCloseTo(-3, 9)
    // En general, (q, s) del proximal es (q⁻¹, −q⁻¹·s) del distal.
    const q = giro([0.3, -1, 0.2], 17)
    const s: [number, number, number] = [1.5, -2, 0.7]
    const inversa = { qx: -q[0], qy: -q[1], qz: -q[2], qw: q[3] }
    const sDelDistal = girarConLa(inversa, s).map((v) => -v) as [number, number, number]
    const delProximal = lecturaDelDesvio({ giro: q, separacionMm: s }, IZQUIERDA, 'proximal')
    const delDistal = lecturaDelDesvio({ giro: [inversa.qx, inversa.qy, inversa.qz, inversa.qw], separacionMm: sDelDistal }, IZQUIERDA)
    for (const clave of ['lateral', 'anteroposterior', 'axial', 'valgo', 'recurvatum', 'rotacion'] as const) {
      expect(delProximal[clave]).toBeCloseTo(delDistal[clave], 9)
    }
  })

  it('el giro total sale del cuaternión, sin pasar por Euler', () => {
    expect(anguloDelGiro(giro([1, 1, 0], 20))).toBeCloseTo(20, 9)
    // El camino corto: un giro de 350° es uno de 10°.
    expect(anguloDelGiro(giro([0, 0, 1], 350))).toBeCloseTo(10, 6)
  })
})

describe('desvioDelFragmento: contra matrices, también si el trozo parte girado', () => {
  /** Un fragmento colgado de una raíz, con su sitio de reposo como pose relativa al padre. */
  function escena(qReposo: THREE.Quaternion, pReposo: THREE.Vector3) {
    const raiz = new THREE.Group()
    const fragmento = new THREE.Object3D()
    raiz.add(fragmento)
    const reposo = new THREE.Matrix4().compose(pReposo, qReposo, new THREE.Vector3(1, 1, 1))
    return { raiz, fragmento, reposo }
  }

  it('un varo de 8° sobre un trozo que partía girado se lee como 8° de varo, y la resta de Euler no', () => {
    const qReposo = new THREE.Quaternion().setFromEuler(new THREE.Euler(radianes(25), radianes(40), radianes(-15)))
    const pReposo = new THREE.Vector3(0.01, 0.2, -0.03)
    const { raiz, fragmento, reposo } = escena(qReposo, pReposo)
    const [x, y, z, w] = giro([0, 0, 1], 8)
    const varo = new THREE.Quaternion(x, y, z, w)
    // Girado sobre su origen, que en un modelo nuevo es el foco: el foco no se mueve.
    fragmento.position.copy(pReposo)
    fragmento.quaternion.copy(varo.clone().multiply(qReposo))

    const d = desvioDelFragmento(raiz, fragmento, reposo)
    expect(anguloDelGiro(d.giro)).toBeCloseTo(8, 6)
    const l = lecturaDelDesvio({ giro: d.giro, separacionMm: [d.separacion[0] * 1000, d.separacion[1] * 1000, d.separacion[2] * 1000] }, DERECHA)
    expect(l.valgo).toBeCloseTo(-8, 5)
    expect(l.recurvatum).toBeCloseTo(0, 5)
    expect(l.rotacion).toBeCloseTo(0, 5)
    expect(Math.hypot(l.lateral, l.anteroposterior, l.axial)).toBeLessThan(1e-6)

    // Lo que hacía la consola: restar los ángulos de Euler eje por eje. Con el trozo girado de partida, el varo se
    // reparte entre los tres ejes y ninguna resta es el varo.
    const ahora = new THREE.Euler().setFromQuaternion(fragmento.quaternion)
    const antes = new THREE.Euler().setFromQuaternion(qReposo)
    const resta = [ahora.x - antes.x, ahora.y - antes.y, ahora.z - antes.z].map((r) => (r * 180) / Math.PI)
    expect(Math.abs(resta[0]) + Math.abs(resta[1])).toBeGreaterThan(1)
  })

  it('mide en el foco que se le dice: girar sobre el origen mueve un punto que está fuera de él', () => {
    const { raiz, fragmento, reposo } = escena(new THREE.Quaternion(), new THREE.Vector3())
    const [x, y, z, w] = giro([0, 0, 1], 10)
    fragmento.quaternion.set(x, y, z, w)
    expect(Math.hypot(...desvioDelFragmento(raiz, fragmento, reposo).separacion)).toBeLessThan(1e-12)
    // A 5 cm del origen, el mismo giro corre el punto 2·5·sen(5°) cm.
    const lejos = desvioDelFragmento(raiz, fragmento, reposo, new THREE.Vector3(0, -0.05, 0))
    expect(Math.hypot(...lejos.separacion)).toBeCloseTo(2 * 0.05 * Math.sin(radianes(5)), 9)
  })

  it('la traslación sin giro es solo traslación', () => {
    const { raiz, fragmento, reposo } = escena(new THREE.Quaternion(), new THREE.Vector3(0, 0.1, 0))
    fragmento.position.set(0.004, 0.1 - 0.002, 0)
    const d = desvioDelFragmento(raiz, fragmento, reposo)
    expect(anguloDelGiro(d.giro)).toBeCloseTo(0, 9)
    expect(d.separacion[0]).toBeCloseTo(0.004, 12)
    expect(d.separacion[1]).toBeCloseTo(-0.002, 12)
  })
})

describe('ejesDelFragmento y el lado', () => {
  const conDatos = (nombre: string, datos: Record<string, unknown> = {}) => {
    const o = new THREE.Object3D()
    o.name = nombre
    o.userData = datos
    return o
  }

  it('usa los ejes que trae el archivo del taller tal cual', () => {
    const ejes = { ejeLargo: [0.1, -0.99, 0], ejeDelante: [0, 0, 1], ejeFuera: [-0.99, -0.1, 0] }
    const r = ejesDelFragmento(conDatos('lo_que_sea', ejes))
    expect(r.ejes).toEqual({ largo: ejes.ejeLargo, delante: ejes.ejeDelante, fuera: ejes.ejeFuera })
    expect(r.ladoConocido).toBe(true)
  })

  it('sin ejes en el archivo, supone los del atlas de pie y saca el lado del nombre', () => {
    const derecha = ejesDelFragmento(conDatos('Tibia_derecha_fragmento_distal'))
    expect(derecha.ejes).toEqual({ largo: [0, -1, 0], delante: [0, 0, 1], fuera: [-1, 0, 0] })
    expect(derecha.ladoConocido).toBe(true)
    // `+ 0` borra el signo de los ceros: el lado izquierdo sale de multiplicar por −1, y −0 es el mismo eje.
    const sinSigno = (v: readonly number[]) => v.map((n) => n + 0)
    expect(sinSigno(ejesDelFragmento(conDatos('Left tibia')).ejes.fuera)).toEqual([1, 0, 0])
    // El lado escrito manda sobre el nombre.
    expect(sinSigno(ejesDelFragmento(conDatos('Right tibia', { lado: 'izquierdo' })).ejes.fuera)).toEqual([1, 0, 0])
  })

  it('sin lado que leer, toma el derecho y lo dice', () => {
    const r = ejesDelFragmento(conDatos('fragmento'))
    expect(r.ejes.fuera).toEqual([-1, 0, 0])
    expect(r.ladoConocido).toBe(false)
  })

  it('con el eje largo en z, delante es +y', () => {
    const r = ejesDelFragmento(conDatos('Right tibia'), 'z')
    expect(r.ejes.largo).toEqual([0, 0, -1])
    expect(r.ejes.delante).toEqual([0, 1, 0])
  })

  it('el lado por el nombre, en español o en el inglés del atlas, con guion bajo y sin tildes', () => {
    expect(ladoPorElNombre('Tibia_derecha_fragmento')).toBe('derecho')
    expect(ladoPorElNombre('Fémur IZQUIERDO')).toBe('izquierdo')
    expect(ladoPorElNombre('Left tibia')).toBe('izquierdo')
    expect(ladoPorElNombre(null, 7, 'Right fibula')).toBe('derecho')
    expect(ladoPorElNombre('Tibia')).toBeNull()
  })

  it('de qué trozo es, solo si el archivo lo dice', () => {
    expect(trozoDelFragmento(conDatos('x', { trozo: 'distal' }))).toBe('distal')
    expect(trozoDelFragmento(conDatos('x', { trozo: 'proximal' }))).toBe('proximal')
    expect(trozoDelFragmento(conDatos('x', { trozo: 'medio' }))).toBeNull()
  })
})

describe('las cuentas rígidas, sin three', () => {
  const t = (q: [number, number, number, number], p: [number, number, number]): TransformacionRigida => ({
    x: p[0],
    y: p[1],
    z: p[2],
    qx: q[0],
    qy: q[1],
    qz: q[2],
    qw: q[3],
  })
  const cerca = (a: readonly number[], b: readonly number[], digitos = 9) =>
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digitos))

  const A = t(giro([0.2, 1, -0.4], 33), [0.01, -0.02, 0.005])
  const B = t(giro([1, 0, 0.3], -21), [-0.004, 0.03, 0.012])
  const P: [number, number, number] = [0.07, -0.11, 0.02]

  it('componer es aplicar una detrás de otra, y la inversa deshace', () => {
    cerca(aplicarLa(componer(A, B), P), aplicarLa(A, aplicarLa(B, P)))
    cerca(aplicarLa(componer(A, invertir(A)), P), P)
    expect(esCasiIdentidad(componer(invertir(B), B), 1000)).toBe(true)
  })

  it('delTaller es lo que dibuja el taller: centro + mover + giro·(p − centro)', () => {
    const centro: [number, number, number] = [-0.07, 0.3, 0.01]
    const mover: [number, number, number] = [0.012, -0.004, 0.003]
    const q = giro([0, 0, 1], 9)
    const comoElTaller = (() => {
      const r = girarConLa({ qx: q[0], qy: q[1], qz: q[2], qw: q[3] }, [P[0] - centro[0], P[1] - centro[1], P[2] - centro[2]])
      return [centro[0] + mover[0] + r[0], centro[1] + mover[1] + r[1], centro[2] + mover[2] + r[2]]
    })()
    cerca(aplicarLa(delTaller(centro, mover, q), P), comoElTaller)
  })

  it('en un marco corrido hace lo mismo con las coordenadas corridas', () => {
    // El archivo está centrado: sus coordenadas son las del cuerpo menos el centro.
    const centro: [number, number, number] = [-0.08, 0.26, 0.004]
    const enElArchivo = enUnMarcoCorrido(A, centro)
    const pArchivo: [number, number, number] = [P[0] - centro[0], P[1] - centro[1], P[2] - centro[2]]
    const esperado = aplicarLa(A, P).map((v, i) => v - centro[i])
    cerca(aplicarLa(enElArchivo, pArchivo), esperado)
    // La identidad sigue siéndolo, corra lo que corra.
    expect(esCasiIdentidad(enUnMarcoCorrido(IDENTIDAD, centro), 1000)).toBe(true)
  })
})
