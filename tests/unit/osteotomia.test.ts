import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import * as THREE from 'three'
import { partirMalla, type MallaIndexada } from '@/lib/osteotomia'
import {
  caraDelGiro,
  describirCorte,
  ejeDelHueso,
  normalizarCorte,
  planoDelCorte,
  type Vector3,
} from '@/lib/planoDeCorte'
import type { CatalogoDelAtlas } from '@/atlas/formato'

/**
 * El corte de un hueso, probado por lo que hace y con geometría de verdad.
 *
 * Nada de aquí mira cuántos vértices salen ni en qué orden: eso cambia con
 * cualquier mejora del algoritmo y no le importa a nadie. Lo que importa es lo
 * que se ve al separar el fragmento en la consola, y eso se mide así:
 *
 *  - que cada trozo esté CERRADO: soldando por posición, cada arista la
 *    comparten exactamente dos triángulos y en sentidos opuestos. Con una sola,
 *    hay un agujero; con el mismo sentido, una cara vuelta del revés;
 *  - que los volúmenes de los dos trozos sean positivos y sumen el del original:
 *    una malla abierta o mal orientada no tiene volumen que cuadre;
 *  - que la tapa mire hacia fuera de su trozo, por su geometría y por la normal
 *    que lleva escrita, que es la que usa la luz.
 */

// ------------------------------------------------------------------ medidas

type Aristas = Map<string, number>

/** Cuenta las aristas por posición: +1 en un sentido, y se anota el otro aparte. */
function aristasPorPosicion(malla: MallaIndexada): { dirigidas: Aristas; sinSentido: Aristas } {
  const { posiciones, indices } = malla
  // A la micra y no exacta: el cilindro de three cierra su costura con
  // sin(2π) ≠ 0, y esa costura es de la malla de partida, no del corte.
  const micras = (x: number) => Math.round(x * 1e6)
  const clave = (v: number) =>
    `${micras(posiciones[v * 3])},${micras(posiciones[v * 3 + 1])},${micras(posiciones[v * 3 + 2])}`
  const dirigidas: Aristas = new Map()
  const sinSentido: Aristas = new Map()
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [clave(indices[t]), clave(indices[t + 1]), clave(indices[t + 2])]
    for (let k = 0; k < 3; k += 1) {
      const a = tri[k]
      const b = tri[(k + 1) % 3]
      if (a === b) continue
      dirigidas.set(`${a}>${b}`, (dirigidas.get(`${a}>${b}`) ?? 0) + 1)
      const s = a < b ? `${a}|${b}` : `${b}|${a}`
      sinSentido.set(s, (sinSentido.get(s) ?? 0) + 1)
    }
  }
  return { dirigidas, sinSentido }
}

/** Si la malla es cerrada y está orientada con coherencia. */
function cerrada(malla: MallaIndexada): { cerrada: boolean; malas: number } {
  const { dirigidas, sinSentido } = aristasPorPosicion(malla)
  let malas = 0
  for (const n of sinSentido.values()) if (n !== 2) malas += 1
  for (const [arista, n] of dirigidas) {
    const [a, b] = arista.split('>')
    if (n !== 1 || dirigidas.get(`${b}>${a}`) !== 1) malas += 1
  }
  return { cerrada: malas === 0 && sinSentido.size > 0, malas }
}

/** Volumen con signo por el teorema de la divergencia. */
function volumen(malla: MallaIndexada): number {
  const { posiciones: p, indices } = malla
  let v = 0
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3
    const b = indices[t + 1] * 3
    const c = indices[t + 2] * 3
    v +=
      (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
        p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
      6
  }
  return v
}

function indicesValidos(malla: MallaIndexada): boolean {
  const vertices = malla.posiciones.length / 3
  return (
    malla.indices.length % 3 === 0 &&
    malla.normales.length === malla.posiciones.length &&
    malla.indices.every((i) => i < vertices)
  )
}

/** Una geometría de three a la forma del atlas, con las normales en Int16 si se pide. */
function deThree(geometria: THREE.BufferGeometry, enInt16 = false): MallaIndexada {
  const normales = geometria.getAttribute('normal').array as Float32Array
  return {
    posiciones: new Float32Array(geometria.getAttribute('position').array),
    normales: enInt16
      ? Int16Array.from(normales, (x) => Math.round(x * 32767))
      : new Float32Array(normales),
    indices: Uint32Array.from(geometria.getIndex()!.array),
  }
}

/**
 * Los triángulos de la tapa de un trozo y hacia dónde miran.
 *
 * Se reconocen por las dos cosas a la vez: los tres vértices en el plano y la
 * normal escrita paralela a la del plano. Solo con la posición, un triángulo de
 * la cáscara partido muy cerca del plano —una astilla de un vértice a menos de
 * una décima de milímetro— contaría como tapa y miraría a donde mire la cáscara.
 * La normal se compara en valor absoluto, así que una tapa con la normal escrita
 * al revés sigue contando, y sale en `normalesBien`.
 */
function tapa(
  malla: MallaIndexada,
  punto: Vector3,
  normalDelPlano: Vector3,
  fuera: 1 | -1,
): { hacia: number; contra: number; normalesBien: boolean } {
  const { posiciones: p, normales, indices } = malla
  const escala = normales instanceof Int16Array ? 1 / 32767 : 1
  const alineada = (v: number) =>
    (normales[v * 3] * normalDelPlano[0] +
      normales[v * 3 + 1] * normalDelPlano[1] +
      normales[v * 3 + 2] * normalDelPlano[2]) *
    escala
  const enPlano = (v: number) =>
    Math.abs(
      (p[v * 3] - punto[0]) * normalDelPlano[0] +
        (p[v * 3 + 1] - punto[1]) * normalDelPlano[1] +
        (p[v * 3 + 2] - punto[2]) * normalDelPlano[2],
    ) < 1e-4 && Math.abs(alineada(v)) > 0.999
  let hacia = 0
  let contra = 0
  let normalesBien = true
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
    if (!enPlano(a) || !enPlano(b) || !enPlano(c)) continue
    const ab = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]]
    const ac = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]]
    const cruz = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ]
    const signo =
      cruz[0] * normalDelPlano[0] + cruz[1] * normalDelPlano[1] + cruz[2] * normalDelPlano[2]
    // Una astilla de área nula —tres puntos de corte casi alineados sobre la
    // misma cara de la cáscara, que el triangulador une— no mira a ningún lado:
    // su signo es el redondeo de los flotantes de 32 bits, con áreas de una
    // billonésima de metro cuadrado. Se cuenta a partir de una diezmilésima de
    // milímetro cuadrado: muy por encima de ese ruido y muy por debajo de
    // cualquier triángulo de verdad de estas mallas.
    if (Math.hypot(cruz[0], cruz[1], cruz[2]) / 2 < 1e-10) continue
    if (signo * fuera > 0) hacia += 1
    else if (signo * fuera < 0) contra += 1
    for (const v of [a, b, c]) if (alineada(v) * fuera < 0.999) normalesBien = false
  }
  return { hacia, contra, normalesBien }
}

function comprobarCorteLimpio(original: MallaIndexada, punto: Vector3, normal: Vector3) {
  const r = partirMalla(original, { punto, normal })
  expect(r.avisos).toEqual([])
  for (const trozo of [r.haciaLaNormal, r.contraLaNormal]) {
    expect(indicesValidos(trozo)).toBe(true)
    expect(cerrada(trozo)).toEqual({ cerrada: true, malas: 0 })
    expect(volumen(trozo)).toBeGreaterThan(0)
  }
  const total = volumen(original)
  expect(volumen(r.haciaLaNormal) + volumen(r.contraLaNormal)).toBeCloseTo(total, 6)

  // La tapa del trozo hacia la normal mira contra ella, y la del otro, a favor.
  const unit = normal.map((x) => x / Math.hypot(...normal)) as Vector3
  const tapaPositiva = tapa(r.haciaLaNormal, punto, unit, -1)
  const tapaNegativa = tapa(r.contraLaNormal, punto, unit, 1)
  for (const t of [tapaPositiva, tapaNegativa]) {
    expect(t.hacia).toBeGreaterThan(0)
    expect(t.contra).toBe(0)
    expect(t.normalesBien).toBe(true)
  }
  return r
}

// ------------------------------------------------------------------ pruebas

describe('partir una malla cerrada', () => {
  it('un cilindro cortado de través da dos cilindros cerrados que suman el volumen', () => {
    // CylinderGeometry repite los vértices de la costura y los de las tapas: es
    // el mismo tipo de malla que las piezas del atlas, cerrada por posición y
    // abierta por índice.
    const cilindro = deThree(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 24, 6))
    const lados = 24
    const esperado = (lados / 2) * 0.02 * 0.02 * Math.sin((2 * Math.PI) / lados) * 0.3
    expect(volumen(cilindro)).toBeCloseTo(esperado, 9)
    const r = comprobarCorteLimpio(cilindro, [0, 0.013, 0], [0, 1, 0])
    // El de arriba mide lo que le queda de altura: 0,15 − 0,013.
    expect(volumen(r.haciaLaNormal) / esperado).toBeCloseTo((0.15 - 0.013) / 0.3, 5)
  })

  it('y cortado en oblicuo, también', () => {
    const cilindro = deThree(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 32, 5))
    const normal: Vector3 = [Math.sin(Math.PI / 4), Math.cos(Math.PI / 4), 0.1]
    comprobarCorteLimpio(cilindro, [0.003, -0.02, 0.001], normal)
  })

  it('una caja cortada justo a la altura de sus vértices, con puntos alineados en cada cara', () => {
    // Dos trampas a la vez. El plano y = 0 pasa por los vértices de la fila del
    // medio, así que hay que apartarlo de ellos. Y cada cara lateral, partida
    // por su diagonal, deja tres puntos de corte en línea recta que Earcut quita:
    // sin reparar eso, la tapa deja aristas de la cáscara sin pareja.
    const caja = deThree(new THREE.BoxGeometry(0.04, 0.2, 0.03, 1, 2, 1))
    comprobarCorteLimpio(caja, [0, 0, 0], [0, 1, 0])
    comprobarCorteLimpio(caja, [0, 0.03, 0], [0, 1, 0])
  })

  it('un tubo de pared gruesa deja una tapa con agujero, no un disco macizo', () => {
    // La sección de una cortical con su canal medular: dos contornos, uno
    // dentro del otro. Tapados como dos discos, el canal quedaría macizo y los
    // volúmenes no cuadrarían.
    const perfil = [
      new THREE.Vector2(0.01, -0.1),
      new THREE.Vector2(0.02, -0.1),
      new THREE.Vector2(0.02, 0.1),
      new THREE.Vector2(0.01, 0.1),
      new THREE.Vector2(0.01, -0.1),
    ]
    const torno = new THREE.LatheGeometry(perfil, 20)
    // LatheGeometry trae índices, pero sus normales no importan aquí.
    const tubo = deThree(torno)
    // Un torno gira el perfil en sentido contrario al que mira fuera: se da la
    // vuelta al orden de los índices para que el volumen salga positivo.
    if (volumen(tubo) < 0) {
      for (let t = 0; t < tubo.indices.length; t += 3) {
        const b = tubo.indices[t + 1]
        tubo.indices[t + 1] = tubo.indices[t + 2]
        tubo.indices[t + 2] = b
      }
    }
    const anillo = Math.PI * (0.02 ** 2 - 0.01 ** 2) * 0.2
    expect(volumen(tubo) / anillo).toBeGreaterThan(0.95)
    const r = comprobarCorteLimpio(tubo, [0, 0.02, 0], [0.1, 1, 0])
    expect(r.lazos).toEqual({ tapados: 2, abiertos: 0 })
  })

  it('interpola las normales en flotante y las devuelve en Int16', () => {
    const cilindro = deThree(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 16, 1), true)
    const r = comprobarCorteLimpio(cilindro, [0, 0.05, 0], [0.2, 1, 0.1])
    for (const trozo of [r.haciaLaNormal, r.contraLaNormal]) {
      expect(trozo.normales).toBeInstanceOf(Int16Array)
      // Ninguna normal acortada: interpolar los enteros tal cual deja normales
      // de largo menor que uno a medio camino entre dos caras.
      for (let v = 0; v < trozo.normales.length; v += 3) {
        const l = Math.hypot(trozo.normales[v], trozo.normales[v + 1], trozo.normales[v + 2]) / 32767
        expect(l).toBeGreaterThan(0.999)
        expect(l).toBeLessThan(1.001)
      }
    }
  })
})

describe('lo que no se puede partir, o no del todo', () => {
  it('si el plano no toca la malla, lo dice en vez de devolver un trozo vacío', () => {
    const caja = deThree(new THREE.BoxGeometry(0.1, 0.1, 0.1))
    expect(() => partirMalla(caja, { punto: [0, 0.3, 0], normal: [0, 1, 0] })).toThrow(
      /no corta la malla/,
    )
  })

  it('una malla abierta se corta igual, tapa lo que cierra y avisa de lo que no', () => {
    // Un cilindro sin tapas y sin tres caras laterales: el contorno del corte es
    // un arco que no cierra.
    const hueco = deThree(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 12, 1, true))
    const indices = Array.from(hueco.indices).slice(0, hueco.indices.length - 3 * 6)
    const abierto = { ...hueco, indices: Uint32Array.from(indices) }
    // La medida de «cerrada» distingue: sin esto, todas las pruebas de arriba
    // podrían estar pasando con una medida que lo da todo por bueno.
    expect(cerrada(abierto).cerrada).toBe(false)
    const r = partirMalla(abierto, { punto: [0, 0.01, 0], normal: [0, 1, 0] })
    expect(r.lazos).toEqual({ tapados: 0, abiertos: 1 })
    expect(r.avisos.join(' ')).toMatch(/no cierra/)
    expect(r.haciaLaNormal.indices.length).toBeGreaterThan(0)
    expect(r.contraLaNormal.indices.length).toBeGreaterThan(0)
    expect(indicesValidos(r.haciaLaNormal) && indicesValidos(r.contraLaNormal)).toBe(true)
  })
})

// --------------------------------------------------------- el eje y el plano

describe('el eje largo y el plano del corte', () => {
  it('encuentra el eje de un cilindro inclinado y lo orienta de proximal a distal', () => {
    // Un cilindro de 30 cm, inclinado 20° desde la vertical, en el lado derecho
    // del cuerpo (x negativa) y con las epífisis más teseladas que la diáfisis:
    // el eje tiene que salir del área, no de dónde hay más vértices.
    const geometria = new THREE.CylinderGeometry(0.015, 0.015, 0.3, 24, 30)
    geometria.rotateZ((20 * Math.PI) / 180)
    geometria.translate(-0.08, 0.3, 0)
    const malla = deThree(geometria)
    const eje = ejeDelHueso(malla.posiciones, malla.indices)!
    const esperado = new THREE.Vector3(0, -1, 0).applyAxisAngle(
      new THREE.Vector3(0, 0, 1),
      (20 * Math.PI) / 180,
    )
    // Hacia abajo, que en un hueso casi vertical es de proximal a distal.
    expect(eje.direccion[1]).toBeLessThan(0)
    expect(new THREE.Vector3(...eje.direccion).angleTo(esperado)).toBeLessThan(1e-3)
    expect(eje.distal - eje.proximal).toBeCloseTo(0.3, 6)
    expect(eje.radio).toBeCloseTo(0.015, 6)
    // Delante es +z y fuera, en el lado derecho, va hacia x negativa.
    expect(eje.delante[2]).toBeGreaterThan(0.99)
    expect(eje.fuera[0]).toBeLessThan(-0.9)
  })

  it('con el eje de la tibia de verdad, un corte oblicuo sube por la cara que dice el giro', () => {
    const tibia = leerPieza('FJ3387')
    const eje = ejeDelHueso(tibia.posiciones, tibia.indices)!
    // La tibia derecha del atlas es casi vertical: de proximal a distal es hacia
    // abajo, y la cara lateral de la derecha está hacia x negativa.
    expect(eje.direccion[1]).toBeLessThan(-0.95)
    expect(eje.fuera[0]).toBeLessThan(-0.9)

    const transversal = planoDelCorte(eje, { posicion: 50, inclinacion: 0, giro: 0 })
    expect(transversal.normal).toEqual(eje.direccion)

    const oblicua = planoDelCorte(eje, { posicion: 50, inclinacion: 30, giro: 90 })
    const coseno = oblicua.normal.reduce((t, x, i) => t + x * eje.direccion[i], 0)
    expect((Math.acos(coseno) * 180) / Math.PI).toBeCloseTo(30, 6)
    // Un punto sobre la cara lateral, en el plano: queda por encima (proximal)
    // del centro del corte, y uno sobre la medial, por debajo.
    const alturaEnElPlano = (cara: 1 | -1) => {
      const r = 0.02 * cara
      const base = oblicua.punto.map((x, i) => x + eje.fuera[i] * r)
      // s tal que (base + s·dir − punto)·normal = 0
      const s =
        -base.reduce((t, x, i) => t + (x - oblicua.punto[i]) * oblicua.normal[i], 0) / coseno
      return s
    }
    expect(alturaEnElPlano(1)).toBeLessThan(0)
    expect(alturaEnElPlano(-1)).toBeGreaterThan(0)
    expect(caraDelGiro(90)).toBe('lateral')
    expect(describirCorte({ posicion: 40, inclinacion: 30, giro: 90, fragmento: 'distal' })).toBe(
      'corte oblicuo de 30°, más proximal por la cara lateral, a un 40 % de su longitud, contado desde proximal; se mueve el fragmento distal',
    )
  })

  it('normaliza lo que llega de fuera y rechaza lo imposible con palabras', () => {
    expect(normalizarCorte(undefined)).toBeNull()
    expect(normalizarCorte({ pieza: 'FJ3387' })).toEqual({
      pieza: 'FJ3387',
      posicion: 50,
      inclinacion: 0,
      giro: 0,
      fragmento: 'distal',
    })
    expect(normalizarCorte({ pieza: 'FJ3387', giro: -90 })?.giro).toBe(270)
    expect(() => normalizarCorte({ pieza: 'FJ3387', posicion: 99 })).toThrow(/entre el 5 y el 95/)
    expect(() => normalizarCorte({ pieza: 'FJ3387', inclinacion: 75 })).toThrow(/0 y 60/)
    expect(() => normalizarCorte({ pieza: 'FJ3387', fragmento: 'medio' })).toThrow(/proximal o el distal/)
    expect(() => normalizarCorte({ posicion: 50 })).toThrow(/qué pieza/)
    expect(() => normalizarCorte({ pieza: 'FJ3387', posicion: '50' })).toThrow(/no numérico/)
  })
})

// ----------------------------------------------------------- el atlas de verdad

const ATLAS = join(process.cwd(), 'public', 'atlas')

function leerPieza(id: string): MallaIndexada {
  const catalogo = JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8')) as CatalogoDelAtlas
  const pieza = catalogo.piezas.find((p) => p.id === id)!
  const crudo = gunzipSync(readFileSync(join(ATLAS, catalogo.paquetes[pieza.paquete].archivo)))
  const bufer = crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + crudo.byteLength)
  return {
    posiciones: new Float32Array(new Float32Array(bufer, pieza.pos, pieza.vertices * 3)),
    normales: new Int16Array(new Int16Array(bufer, pieza.nor, pieza.vertices * 3)),
    indices: new Uint32Array(new Uint32Array(bufer, pieza.idx, pieza.indices)),
  }
}

describe('la tibia derecha del atlas', () => {
  const tibia = leerPieza('FJ3387')

  it('llega cerrada por posición, que es lo que el corte presupone', () => {
    // Por índice no lo está: repite vértices en las costuras.
    expect(cerrada(tibia).cerrada).toBe(true)
    expect(volumen(tibia)).toBeGreaterThan(0)
  })

  it.each([
    ['transversal a media diáfisis', { posicion: 50, inclinacion: 0, giro: 0 }],
    ['oblicua de 45° por la cara lateral, en el tercio distal', { posicion: 70, inclinacion: 45, giro: 90 }],
    ['oblicua de 60° hacia atrás, en el tercio proximal', { posicion: 30, inclinacion: 60, giro: 180 }],
  ])('partida %s da dos trozos cerrados que suman la tibia', (_nombre, corte) => {
    const eje = ejeDelHueso(tibia.posiciones, tibia.indices)!
    const plano = planoDelCorte(eje, corte)
    const r = comprobarCorteLimpio(tibia, plano.punto, plano.normal)
    expect(r.lazos).toEqual({ tapados: 1, abiertos: 0 })
    // El distal es el que queda hacia la normal: su caja está más abajo.
    const alturaMedia = (m: MallaIndexada) => {
      let y = 0
      for (let i = 1; i < m.posiciones.length; i += 3) y += m.posiciones[i]
      return y / (m.posiciones.length / 3)
    }
    expect(alturaMedia(r.haciaLaNormal)).toBeLessThan(alturaMedia(r.contraLaNormal))
    expect(r.haciaLaNormal.normales).toBeInstanceOf(Int16Array)
  })
})
