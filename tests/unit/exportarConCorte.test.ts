import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Payload } from 'payload'
import type { CatalogoDelAtlas } from '@/atlas/formato'

/**
 * Exportar del atlas con un hueso partido: la tibia sale en dos objetos, uno de
 * ellos el fragmento, y todo lo que ya hacía la exportación sigue haciéndolo.
 *
 * Tres alturas, y cada una prueba lo que las otras no pueden:
 *
 *  1. `prepararExportacion` con cilindros: nombres, roles, un solo fragmento,
 *     centrado y piel, y que la cara lateral sigue siendo la lateral en las dos
 *     piernas —que es lo que se rompería si el corte se hiciera después de
 *     centrar—.
 *  2. `exportarPreparacion` con la tibia de verdad y SIN SESIÓN: el archivo que
 *     sale se abre con el cargador del navegador, los dos trozos están cerrados
 *     y suman la tibia, y el taller de piezas del caso marca el fragmento solo.
 *     Es la puerta que va a usar un guion de servidor.
 *  3. La acción: que el corte que manda el taller llega de verdad hasta el
 *     archivo, y que uno imposible se rechaza sin escribir nada.
 */

const { estado, payloadFalso } = vi.hoisted(() => ({
  estado: { usuario: null as Record<string, unknown> | null },
  payloadFalso: {
    findByID: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    config: { collections: [] as unknown[] },
  },
}))

// Sin cuenta por omisión: la segunda parte tiene que funcionar así. Solo la
// tercera, que pasa por la guardia, pone un editor.
vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: Boolean(estado.usuario),
    rolReal: estado.usuario ? 'editor' : null,
    rol: estado.usuario ? 'editor' : null,
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: async () => payloadFalso,
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { avisosDeLaExportacion, prepararExportacion, type PiezaLeida } from '@/lib/exportarAtlas'
import { exportarPreparacion } from '@/lib/exportarPreparacion'
import { exportarComoModelo } from '@/app/(frontend)/acciones/atlas'
import { datosDeLosNodos } from '@/components/simulador/LienzoQuirurgico'
import { propuestasDelModelo, rellenarDesdeElModelo } from '@/lib/piezasDelCaso'

// ------------------------------------------------------------------ medidas

/** Cerrada y orientada con coherencia, soldando a la micra. */
function cerrada(posiciones: ArrayLike<number>, indices: ArrayLike<number>): boolean {
  const micras = (x: number) => Math.round(x * 1e6)
  const clave = (v: number) =>
    `${micras(posiciones[v * 3])},${micras(posiciones[v * 3 + 1])},${micras(posiciones[v * 3 + 2])}`
  const dirigidas = new Map<string, number>()
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [clave(indices[t]), clave(indices[t + 1]), clave(indices[t + 2])]
    for (let k = 0; k < 3; k += 1) {
      const a = tri[k]
      const b = tri[(k + 1) % 3]
      if (a !== b) dirigidas.set(`${a}>${b}`, (dirigidas.get(`${a}>${b}`) ?? 0) + 1)
    }
  }
  if (dirigidas.size === 0) return false
  for (const [arista, n] of dirigidas) {
    const [a, b] = arista.split('>')
    if (n !== 1 || dirigidas.get(`${b}>${a}`) !== 1) return false
  }
  return true
}

function volumen(p: ArrayLike<number>, indices: ArrayLike<number>): number {
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

/**
 * Las posiciones de un objeto en las coordenadas del archivo, con la traslación
 * de su nodo sumada.
 *
 * El fragmento sale con su origen en el foco (`pivoteEnElFoco`) y sus vértices
 * relativos a él: medir sus posiciones tal cual es medir otra cosa que lo que se
 * ve, y una prueba así pasaría con el fragmento a 8 cm de su sitio.
 */
function enElArchivo(o: { posiciones: Float32Array; traslacion?: [number, number, number] }): Float64Array {
  const t = o.traslacion ?? [0, 0, 0]
  return Float64Array.from(o.posiciones, (v, i) => v + t[i % 3])
}

/** Un cilindro vertical de three, como pieza del atlas: normales en Int16. */
function cilindro(
  id: string,
  nombre: string,
  sistema: string,
  { x, y, radio, alto }: { x: number; y: number; radio: number; alto: number },
): PiezaLeida {
  const g = new THREE.CylinderGeometry(radio, radio, alto, 20, 8)
  g.translate(x, y, 0)
  return {
    id,
    nombre,
    sistema,
    posiciones: new Float32Array(g.getAttribute('position').array),
    normales: Int16Array.from(g.getAttribute('normal').array, (n) => Math.round(n * 32767)),
    indices: Uint32Array.from(g.getIndex()!.array),
  }
}

/**
 * Una piel de 1,72 m de alto alrededor de la pierna: la del atlas es de cuerpo
 * entero, y lo que importa aquí es que llegue por encima de la rodilla para que
 * haya algo que recortar.
 */
function pielDeCuerpoEntero(signo: number): PiezaLeida {
  return cilindro('piel', 'Skin', 'integumentary', { x: -0.08 * signo, y: 0.86, radio: 0.05, alto: 1.72 })
}

const TIBIA = { x: -0.07, y: 0.26, radio: 0.012, alto: 0.36 }
const OPCIONES = {
  protagonistas: ['tibia', 'perone'],
  nombresDeSistema: { skeletal: 'Esqueleto', muscular: 'Músculos', integumentary: 'Piel' },
}

function pierna(lado: 'derecha' | 'izquierda' = 'derecha'): PiezaLeida[] {
  const signo = lado === 'derecha' ? 1 : -1
  const ingles = lado === 'derecha' ? 'Right' : 'Left'
  return [
    cilindro('tibia', `${ingles} tibia`, 'skeletal', { ...TIBIA, x: TIBIA.x * signo }),
    cilindro('perone', `${ingles} fibula`, 'skeletal', {
      x: -0.1 * signo,
      y: 0.25,
      radio: 0.007,
      alto: 0.34,
    }),
    cilindro('musculo', `${ingles} tibialis anterior`, 'muscular', {
      x: -0.06 * signo,
      y: 0.3,
      radio: 0.01,
      alto: 0.2,
    }),
    pielDeCuerpoEntero(signo),
  ]
}

// ------------------------------------------------ 1. el camino entero, con cilindros

describe('prepararExportacion con un corte', () => {
  it('saca la tibia en dos objetos con nombre, rol y un solo fragmento', () => {
    const r = prepararExportacion(pierna(), {
      ...OPCIONES,
      corte: { pieza: 'tibia', posicion: 60, inclinacion: 0, giro: 0, fragmento: 'distal' },
    })

    expect(r.piezas.slice(0, 3)).toEqual([
      { nodo: 'Tibia_derecha_fragmento_proximal', etiqueta: 'Tibia derecha, fragmento proximal', rol: 'hueso' },
      { nodo: 'Tibia_derecha_fragmento_distal', etiqueta: 'Tibia derecha, fragmento distal', rol: 'fragmento' },
      { nodo: 'Perone_derecho', etiqueta: 'Peroné derecho', rol: 'hueso' },
    ])
    expect(r.piezas.filter((p) => p.rol === 'fragmento')).toHaveLength(1)
    expect(r.corte).toMatchObject({
      etiqueta: 'Tibia derecha',
      proximal: 'Tibia_derecha_fragmento_proximal',
      distal: 'Tibia_derecha_fragmento_distal',
      fragmento: 'Tibia_derecha_fragmento_distal',
      avisos: [],
    })
    expect(r.corte?.descripcion).toContain('transversal, a un 60 %')

    // Lo que el taller de piezas del caso hace con el archivo: una fila de
    // fragmento, y es la del trozo distal.
    const { piezas } = rellenarDesdeElModelo([], r.piezas)
    expect(piezas.filter((p) => p.rol === 'fragmento').map((p) => p.nodo)).toEqual([
      'Tibia_derecha_fragmento_distal',
    ])

    // Los dos trozos, cerrados, y el proximal con el 60 % del volumen: la
    // posición se cuenta de proximal a distal.
    const [proximal, distal] = r.objetos
    for (const trozo of [proximal, distal]) expect(cerrada(trozo.posiciones, trozo.indices)).toBe(true)
    const vProximal = volumen(proximal.posiciones, proximal.indices)
    const vDistal = volumen(distal.posiciones, distal.indices)
    const entera = cilindro('t', 'Right tibia', 'skeletal', TIBIA)
    expect(vProximal + vDistal).toBeCloseTo(volumen(entera.posiciones, entera.indices), 8)
    expect(vProximal / (vProximal + vDistal)).toBeCloseTo(0.6, 3)
    // Y el distal está debajo.
    const alto = (o: { posiciones: Float32Array; traslacion?: [number, number, number] }) =>
      new THREE.Box3().setFromArray(enElArchivo(o)).getCenter(new THREE.Vector3()).y
    expect(alto(distal)).toBeLessThan(alto(proximal))
  })

  it('el fragmento sale con su origen en el foco, y el resto con el del archivo', () => {
    const r = prepararExportacion(pierna(), {
      ...OPCIONES,
      corte: { pieza: 'tibia', posicion: 30, inclinacion: 0, giro: 0, fragmento: 'distal' },
    })
    const [proximal, distal] = r.objetos
    // El cilindro es recto: el foco de un corte transversal al 30 % está sobre
    // su eje, al 30 % de su alto desde arriba, en las coordenadas del cuerpo.
    const foco = [TIBIA.x, TIBIA.y + TIBIA.alto / 2 - 0.3 * TIBIA.alto, 0]
    const esperado = foco.map((v, e) => v - r.centro[e])
    expect(distal.traslacion).toBeDefined()
    for (let e = 0; e < 3; e += 1) {
      expect(distal.traslacion![e]).toBeCloseTo(esperado[e], 5)
      expect(r.corte!.pivote[e]).toBeCloseTo(esperado[e], 5)
    }
    // Lejos del origen del archivo: si no, la prueba no distinguiría nada.
    expect(Math.hypot(...distal.traslacion!)).toBeGreaterThan(0.05)
    // Nada más lleva traslación: la consola solo gira el fragmento.
    expect(r.objetos.filter((o) => o.traslacion).map((o) => o.nombre)).toEqual([distal.nombre])
    expect(proximal.traslacion).toBeUndefined()

    // Visto en el archivo, el fragmento sigue exactamente donde estaba: la tapa
    // del distal coincide con la del proximal, vértice a vértice.
    const micras = (p: ArrayLike<number>) => {
      const claves = new Set<string>()
      for (let v = 0; v < p.length; v += 3) {
        claves.add([p[v], p[v + 1], p[v + 2]].map((x) => Math.round(x * 1e6)).join(','))
      }
      return claves
    }
    const deArriba = micras(enElArchivo(proximal))
    const compartidos = [...micras(enElArchivo(distal))].filter((c) => deArriba.has(c))
    expect(compartidos.length).toBeGreaterThanOrEqual(20)
  })

  it('con el fragmento proximal, el origen se pone en el proximal', () => {
    const r = prepararExportacion(pierna(), {
      ...OPCIONES,
      corte: { pieza: 'tibia', posicion: 70, inclinacion: 0, giro: 0, fragmento: 'proximal' },
    })
    const [proximal, distal] = r.objetos
    expect(proximal.traslacion).toBeDefined()
    expect(distal.traslacion).toBeUndefined()
  })

  it('el fragmento puede ser el proximal', () => {
    const r = prepararExportacion(pierna(), {
      ...OPCIONES,
      corte: { pieza: 'tibia', posicion: 40, inclinacion: 20, giro: 0, fragmento: 'proximal' },
    })
    expect(r.piezas.slice(0, 2).map((p) => [p.nodo, p.rol])).toEqual([
      ['Tibia_derecha_fragmento_proximal', 'fragmento'],
      ['Tibia_derecha_fragmento_distal', 'hueso'],
    ])
    expect(r.corte?.fragmento).toBe('Tibia_derecha_fragmento_proximal')
  })

  it('el centrado y el recorte de la piel siguen funcionando con la tibia partida', () => {
    const sinCorte = prepararExportacion(pierna(), OPCIONES)
    const conCorte = prepararExportacion(pierna(), {
      ...OPCIONES,
      corte: { pieza: 'tibia', posicion: 50, inclinacion: 45, giro: 180, fragmento: 'distal' },
    })
    // El mismo centro: los dos trozos juntos ocupan lo mismo que la tibia.
    for (let eje = 0; eje < 3; eje += 1) {
      expect(conCorte.centro[eje]).toBeCloseTo(sinCorte.centro[eje], 6)
    }
    const sinPiel = new THREE.Box3()
    for (const o of conCorte.objetos) {
      if (o.extras?.rol !== 'piel') sinPiel.union(new THREE.Box3().setFromArray(enElArchivo(o)))
    }
    expect(sinPiel.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-6)
    // La piel sigue recortada a la pierna, no de cuerpo entero.
    expect(conCorte.pielRecortada).toBe(true)
    const piel = conCorte.objetos.find((o) => o.extras?.rol === 'piel')!
    expect(new THREE.Box3().setFromArray(piel.posiciones).getSize(new THREE.Vector3()).y).toBeLessThan(0.6)
  })

  it('la cara lateral es la lateral en las dos piernas, aunque el archivo salga centrado', () => {
    // Con el corte oblicuo «más proximal por la cara lateral», el trozo distal
    // llega más arriba por fuera: su vértice más alto está del lado lateral del
    // hueso. Si el corte se hiciera después de centrar, la tibia derecha
    // quedaría con su centro cerca de x = 0 y la cara «lateral» podría salir por
    // dentro, sin un error.
    const corte = { pieza: 'tibia', posicion: 50, inclinacion: 45, giro: 90, fragmento: 'distal' as const }
    const ladoDelPico = (lado: 'derecha' | 'izquierda') => {
      const r = prepararExportacion(pierna(lado), { ...OPCIONES, corte })
      const distal = r.objetos.find((o) => o.extras?.trozo === 'distal')!
      const p = distal.posiciones
      let alto = 0
      let medio = 0
      for (let v = 0; v < p.length; v += 3) {
        if (p[v + 1] > p[alto + 1]) alto = v
        medio += p[v]
      }
      medio /= p.length / 3
      return Math.sign(p[alto] - medio)
    }
    // La derecha está en x negativa: su lateral es −x. La izquierda, +x.
    expect(ladoDelPico('derecha')).toBe(-1)
    expect(ladoDelPico('izquierda')).toBe(1)
  })

  it('un hueso que no cierra sale partido igual, y las notas lo dicen antes que nada', () => {
    // Una tibia con una ventana en la cara anterior justo donde se corta: el
    // contorno del corte no cierra y no se puede tapar. Se exporta, porque el
    // traumatólogo pidió el corte, pero el trozo se verá hueco y eso tiene que
    // constar.
    const [tibia, ...resto] = pierna()
    const p = tibia.posiciones
    const quedan: number[] = []
    for (let t = 0; t < tibia.indices.length; t += 3) {
      const tri = [tibia.indices[t], tibia.indices[t + 1], tibia.indices[t + 2]]
      const y = tri.reduce((suma, v) => suma + p[v * 3 + 1], 0) / 3
      const z = tri.reduce((suma, v) => suma + p[v * 3 + 2], 0) / 3
      if (Math.abs(y - TIBIA.y) < 0.05 && z > 0.008) continue
      quedan.push(...tri)
    }
    const abierta = { ...tibia, indices: Uint32Array.from(quedan) }
    const r = prepararExportacion([abierta, ...resto], {
      ...OPCIONES,
      corte: { pieza: 'tibia', posicion: 50, inclinacion: 0, giro: 0, fragmento: 'distal' },
    })
    expect(r.corte?.avisos).toHaveLength(1)
    expect(r.corte?.avisos[0]).toMatch(/^Al partir «Tibia derecha»: Un borde del corte no cierra/)
    const avisos = avisosDeLaExportacion({ ...r, corte: r.corte })
    expect(avisos[0]).toBe(r.corte?.avisos[0])
    // Sin corte, las notas siguen callando lo que no pasó.
    expect(avisosDeLaExportacion({ pielRecortada: false, pielFuera: [], sinTraducir: [], corte: null })).toEqual([])
  })

  it('sin corte, nada cambia', () => {
    const r = prepararExportacion(pierna(), OPCIONES)
    expect(r.corte).toBeNull()
    expect(r.piezas.slice(0, 2).map((p) => p.nodo)).toEqual(['Tibia_derecha', 'Perone_derecho'])
    expect(r.objetos.some((o) => o.extras?.trozo !== undefined)).toBe(false)
  })

  it('se niega con palabras a partir lo que no es un hueso suelto de la preparación', () => {
    const corte = { posicion: 50, inclinacion: 0, giro: 0, fragmento: 'distal' as const }
    expect(() =>
      prepararExportacion(pierna(), { ...OPCIONES, corte: { ...corte, pieza: 'no-esta' } }),
    ).toThrow(/no está en la preparación/)
    expect(() =>
      prepararExportacion(pierna(), { ...OPCIONES, protagonistas: ['perone'], corte: { ...corte, pieza: 'tibia' } }),
    ).toThrow(/marcarla como pieza suelta/)
    expect(() =>
      prepararExportacion(pierna(), {
        ...OPCIONES,
        protagonistas: ['musculo'],
        corte: { ...corte, pieza: 'musculo' },
      }),
    ).toThrow(/Solo se puede partir un hueso/)
  })
})

// ------------------------------------ 2. la tibia de verdad, sin sesión y hasta el archivo

const ATLAS = join(process.cwd(), 'public', 'atlas')

/** Volumen de una pieza leída directamente del paquete, sin pasar por la exportación. */
function volumenDelAtlas(id: string): number {
  const catalogo = JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8')) as CatalogoDelAtlas
  const pieza = catalogo.piezas.find((p) => p.id === id)!
  const crudo = gunzipSync(readFileSync(join(ATLAS, catalogo.paquetes[pieza.paquete].archivo)))
  const bufer = crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + crudo.byteLength)
  return volumen(
    new Float32Array(bufer, pieza.pos, pieza.vertices * 3),
    new Uint32Array(bufer, pieza.idx, pieza.indices),
  )
}

async function abrir(bytes: Buffer) {
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    '',
  )
  gltf.scene.updateMatrixWorld(true)
  return gltf.scene
}

/** Los vértices de una malla cargada, en coordenadas del mundo: lo que se ve. */
function delMundo(malla: THREE.Mesh): Float64Array {
  malla.updateWorldMatrix(true, false)
  const local = malla.geometry.getAttribute('position')
  const salida = new Float64Array(local.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < local.count; i += 1) {
    v.fromBufferAttribute(local, i).applyMatrix4(malla.matrixWorld)
    salida[i * 3] = v.x
    salida[i * 3 + 1] = v.y
    salida[i * 3 + 2] = v.z
  }
  return salida
}

/**
 * Los vértices del fragmento que tocan al otro trozo, que solo pueden ser los
 * del contorno del corte. Su centro es el foco de la fractura medido sobre lo
 * que se ve, sin fiarse de lo que el exportador dice de él.
 *
 * A la centésima de milímetro y no a la micra: los del fragmento pasan por la
 * matriz de su nodo y los del otro no, y la suma en coma flotante los separa
 * alguna millonésima.
 */
function verticesDelContorno(fragmento: THREE.Mesh, otro: THREE.Mesh): number[] {
  const clave = (p: Float64Array, v: number) =>
    `${Math.round(p[v * 3] * 1e5)},${Math.round(p[v * 3 + 1] * 1e5)},${Math.round(p[v * 3 + 2] * 1e5)}`
  const delOtro = delMundo(otro)
  const claves = new Set<string>()
  for (let v = 0; v < delOtro.length / 3; v += 1) claves.add(clave(delOtro, v))
  const propio = delMundo(fragmento)
  const salida: number[] = []
  for (let v = 0; v < propio.length / 3; v += 1) if (claves.has(clave(propio, v))) salida.push(v)
  return salida
}

function centroDe(posiciones: Float64Array, vertices: number[]): THREE.Vector3 {
  const suma = new THREE.Vector3()
  for (const v of vertices) suma.add(new THREE.Vector3().fromArray(posiciones, v * 3))
  return suma.divideScalar(vertices.length)
}

// La tibia y el peroné derechos.
const PIERNA = ['FJ3387', 'FJ3366']

beforeEach(() => {
  estado.usuario = null
  payloadFalso.findByID.mockReset()
  payloadFalso.create.mockReset()
  payloadFalso.findByID.mockResolvedValue({
    id: 7,
    nombre: 'Tibia derecha partida',
    contenido: { piezas: PIERNA.map((id) => ({ id })) },
  })
  payloadFalso.create.mockResolvedValue({ id: 42 })
})

describe('exportarPreparacion, desde un guion y sin sesión', () => {
  it('escribe un archivo con la tibia partida en dos trozos cerrados que suman la tibia', async () => {
    const modelo = await exportarPreparacion(payloadFalso as unknown as Payload, 7, {
      protagonistas: PIERNA,
      corte: { pieza: 'FJ3387', posicion: 55, inclinacion: 35, giro: 90, fragmento: 'distal' },
    })

    expect(modelo.id).toBe('42')
    expect(modelo.corte?.fragmento).toBe('Tibia_derecha_fragmento_distal')
    expect(modelo.piezas.filter((p) => p.rol === 'fragmento').map((p) => p.nodo)).toEqual([
      'Tibia_derecha_fragmento_distal',
    ])

    const argumentos = payloadFalso.create.mock.calls[0][0] as {
      data: { notas: string }
      file: { data: Buffer }
      user?: unknown
    }
    // Sin nadie detrás: no se inventa un usuario.
    expect('user' in argumentos).toBe(false)
    expect(argumentos.data.notas).toContain('«Tibia derecha» sale partida en dos (corte oblicuo de 35°')
    expect(argumentos.data.notas).toContain(
      'Tibia_derecha_fragmento_proximal y Tibia_derecha_fragmento_distal.',
    )

    const escena = await abrir(argumentos.file.data)
    const mallas = new Map<string, THREE.Mesh>()
    escena.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) mallas.set(o.name, o as THREE.Mesh)
    })
    const proximal = mallas.get('Tibia_derecha_fragmento_proximal')!
    const distal = mallas.get('Tibia_derecha_fragmento_distal')!
    expect(proximal.userData).toMatchObject({ rol: 'hueso', trozo: 'proximal', nombreOriginal: 'Right tibia' })
    expect(distal.userData).toMatchObject({ rol: 'fragmento', trozo: 'distal' })

    // En coordenadas del mundo, que es lo que la consola pinta: el distal lleva
    // la traslación de su nodo y sus vértices son relativos a ella.
    let suma = 0
    for (const trozo of [proximal, distal]) {
      const posiciones = delMundo(trozo)
      const indices = trozo.geometry.getIndex()!.array
      expect(cerrada(posiciones, indices)).toBe(true)
      const v = volumen(posiciones, indices)
      expect(v).toBeGreaterThan(0)
      suma += v
    }
    expect(suma / volumenDelAtlas('FJ3387')).toBeCloseTo(1, 5)

    // Y el taller de piezas del caso, leyendo el archivo como lo lee al abrirlo,
    // deja una sola fila de fragmento: la del trozo distal.
    const { piezas } = rellenarDesdeElModelo([], propuestasDelModelo(datosDeLosNodos(escena)))
    expect(piezas.filter((p) => p.rol === 'fragmento').map((p) => p.nodo)).toEqual([
      'Tibia_derecha_fragmento_distal',
    ])
  }, 60_000)

  it('el fragmento gira sobre el foco de la fractura y no sobre el centro del modelo', async () => {
    // Al 30 %, que es donde el centro del modelo queda más lejos del foco. Lo
    // que se mide es lo que hace la consola (`girarFragmento`): poner
    // `rotation` al nodo del fragmento. Girar 15° sobre el centro del archivo
    // arrastraba el contorno del corte más de 2 cm.
    const modelo = await exportarPreparacion(payloadFalso as unknown as Payload, 7, {
      protagonistas: PIERNA,
      corte: { pieza: 'FJ3387', posicion: 30, inclinacion: 20, giro: 90, fragmento: 'distal' },
    })
    const { file } = payloadFalso.create.mock.calls[0][0] as { file: { data: Buffer } }
    const escena = await abrir(file.data)
    const fragmento = escena.getObjectByName('Tibia_derecha_fragmento_distal') as THREE.Mesh
    const fijo = escena.getObjectByName('Tibia_derecha_fragmento_proximal') as THREE.Mesh

    // El origen del nodo es el que anuncia la exportación, y está lejos del
    // origen del archivo: si no lo estuviera, esta prueba no probaría nada.
    expect(fragmento.position.toArray()).toEqual(
      modelo.corte!.pivote.map((v) => expect.closeTo(v, 6)),
    )
    expect(fragmento.position.length()).toBeGreaterThan(0.05)
    expect(fijo.position.length()).toBe(0)

    // El contorno se toma en reposo: girado, ya no toca al otro trozo.
    const contorno = verticesDelContorno(fragmento, fijo)
    expect(contorno.length).toBeGreaterThan(20)
    const enReposo = delMundo(fragmento)
    const foco = centroDe(enReposo, contorno)
    expect(foco.distanceTo(fragmento.position)).toBeLessThan(0.01)

    const giro = (15 * Math.PI) / 180
    for (const eje of ['x', 'z'] as const) {
      fragmento.rotation.set(0, 0, 0)
      fragmento.rotation[eje] = giro
      const girado = centroDe(delMundo(fragmento), contorno)

      // Lo mismo girado sobre el origen del archivo, que es lo que pasaba con
      // el nodo sin traslación: sirve para saber que la cota de abajo separa
      // una cosa de la otra y no pasa con cualquier archivo.
      const sobreElCentro = foco
        .clone()
        .applyEuler(new THREE.Euler(eje === 'x' ? giro : 0, 0, eje === 'z' ? giro : 0))

      expect(sobreElCentro.distanceTo(foco)).toBeGreaterThan(0.015)
      expect(girado.distanceTo(foco)).toBeLessThan(0.003)
    }
    fragmento.rotation.set(0, 0, 0)
  }, 60_000)

  it('una preparación que aún nombra la piel de antes la pierde sin avisar de nada', async () => {
    // Hasta D-138 esta prueba exportaba con la piel del cuerpo entero (`FJ2810`)
    // y comprobaba que se recortaba y que las notas lo contaban. La piel ya no
    // está en el atlas; el recorte sigue en el código, con pieles sintéticas
    // más arriba. Lo que se comprueba ahora es que una preparación guardada con
    // ella no falla ni avisa de una piel que no existe.
    payloadFalso.findByID.mockResolvedValue({
      id: 9,
      nombre: 'Pierna con piel',
      contenido: { piezas: [...PIERNA, 'FJ2810'].map((id) => ({ id })) },
    })
    const modelo = await exportarPreparacion(payloadFalso as unknown as Payload, 9, {
      protagonistas: PIERNA,
    })
    expect(modelo.pielRecortada).toBe(false)
    expect(modelo.sinLaPiel).toBe(false)
    expect(modelo.corte).toBeNull()
    const { data } = payloadFalso.create.mock.calls[0][0] as { data: { notas: string } }
    expect(data.notas).not.toContain('La piel del atlas')
  }, 60_000)

  it('un corte imposible se rechaza antes de leer el atlas, y no escribe nada', async () => {
    await expect(
      exportarPreparacion(payloadFalso as unknown as Payload, 7, {
        protagonistas: PIERNA,
        corte: { pieza: 'FJ3387', posicion: 99 },
      }),
    ).rejects.toThrow(/entre el 5 y el 95/)
    expect(payloadFalso.findByID).not.toHaveBeenCalled()
    expect(payloadFalso.create).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------- 3. desde el taller, por la acción

describe('exportarComoModelo lleva el corte del taller hasta el archivo', () => {
  beforeEach(() => {
    estado.usuario = { id: 1, rol: 'editor', activo: true }
  })

  it('con el corte que manda el taller, el archivo sale partido y la respuesta lo dice', async () => {
    const r = await exportarComoModelo(7, {
      protagonistas: PIERNA,
      corte: { pieza: 'FJ3387', posicion: 50, inclinacion: 0, giro: 0, fragmento: 'proximal' },
    })
    expect(r.exito, r.mensaje).toBe(true)
    expect(r.datos?.corte).toMatchObject({
      proximal: 'Tibia_derecha_fragmento_proximal',
      distal: 'Tibia_derecha_fragmento_distal',
      fragmento: 'Tibia_derecha_fragmento_proximal',
    })
    const { file, user } = payloadFalso.create.mock.calls[0][0] as { file: { data: Buffer }; user: unknown }
    // Con sesión, el modelo se crea en nombre de quien exporta.
    expect(user).toEqual(estado.usuario)
    const nombres: string[] = []
    ;(await abrir(file.data)).traverse((o) => {
      if ((o as THREE.Mesh).isMesh) nombres.push(o.name)
    })
    expect(nombres.slice(0, 3)).toEqual([
      'Tibia_derecha_fragmento_proximal',
      'Tibia_derecha_fragmento_distal',
      'Perone_derecho',
    ])
  }, 60_000)

  it('un corte sobre una pieza que no se marcó como suelta vuelve como mensaje, sin crear nada', async () => {
    const r = await exportarComoModelo(7, {
      protagonistas: ['FJ3366'],
      corte: { pieza: 'FJ3387', posicion: 50, inclinacion: 0, giro: 0, fragmento: 'distal' },
    })
    expect(r.exito).toBe(false)
    expect(r.mensaje).toMatch(/Para partir «Tibia derecha» hay que marcarla como pieza suelta/)
    expect(payloadFalso.create).not.toHaveBeenCalled()
  }, 60_000)

  it('sin sesión de editor, la acción no llega a leer la preparación', async () => {
    estado.usuario = null
    const r = await exportarComoModelo(7, { protagonistas: PIERNA })
    expect(r.exito).toBe(false)
    expect(payloadFalso.findByID).not.toHaveBeenCalled()
  })
})
