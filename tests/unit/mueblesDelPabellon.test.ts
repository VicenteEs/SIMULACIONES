import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { colocarLaMesa, haciaLaBandeja, MEDIDAS_DE_LA_SALA as M, type ColocacionDeLaMesa } from '@/lib/mesaDeArsenalera'

/**
 * Los muebles de la sala tal como salen de `scripts/pabellon/mobiliario.py` (D-389), leídos del disco.
 *
 * `mesaEnLaEscena.ts` busca los nodos por su nombre y `mesaDeArsenalera.ts` coloca la mesa con medidas escritas a mano.
 * Si el guion de Blender cambia un nombre, deja de pintarse la funda o de subir la bandeja sin ningún error; si cambia
 * una medida, la mesa se mete dentro de la camilla. Esta prueba es la única que se entera.
 *
 * Los `.glb` van comprimidos con Draco y three no los abre en node sin el decodificador. No hace falta: el glTF guarda
 * en claro la jerarquía, los nombres y la caja de cada malla (el `min` y el `max` de sus posiciones, que la norma exige).
 */

const PUBLICO = resolve(process.cwd(), 'public', 'pabellon')

interface Nodo {
  name?: string
  mesh?: number
  children?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
}
interface Documento {
  scenes: { nodes: number[] }[]
  nodes: Nodo[]
  meshes: { primitives: { attributes: { POSITION: number } }[] }[]
  accessors: { min?: number[]; max?: number[] }[]
  extensionsUsed?: string[]
  extensionsRequired?: string[]
}

function leer(archivo: string): Documento {
  const bytes = readFileSync(resolve(PUBLICO, archivo))
  expect(bytes.toString('ascii', 0, 4)).toBe('glTF')
  const largo = bytes.readUInt32LE(12)
  return JSON.parse(bytes.toString('utf8', 20, 20 + largo)) as Documento
}

/** Las cajas de cada nodo con nombre, con lo que cuelga de él, en el marco del archivo. */
function cajas(doc: Documento): Map<string, THREE.Box3> {
  const resultado = new Map<string, THREE.Box3>()
  const recorrer = (i: number, padre: THREE.Matrix4, acumuladas: THREE.Box3[]) => {
    const nodo = doc.nodes[i]
    const propia = new THREE.Matrix4().compose(
      new THREE.Vector3(...((nodo.translation ?? [0, 0, 0]) as [number, number, number])),
      new THREE.Quaternion(...((nodo.rotation ?? [0, 0, 0, 1]) as [number, number, number, number])),
      new THREE.Vector3(...((nodo.scale ?? [1, 1, 1]) as [number, number, number])),
    )
    const mundo = padre.clone().multiply(propia)
    const caja = new THREE.Box3()
    const deEste = [...acumuladas, caja]
    if (nodo.mesh !== undefined) {
      for (const primitiva of doc.meshes[nodo.mesh].primitives) {
        const { min, max } = doc.accessors[primitiva.attributes.POSITION]
        if (!min || !max) continue
        const local = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)).applyMatrix4(mundo)
        for (const c of deEste) c.union(local)
      }
    }
    for (const hijo of nodo.children ?? []) recorrer(hijo, mundo, deEste)
    if (nodo.name) resultado.set(nodo.name, caja)
  }
  for (const raiz of doc.scenes[0].nodes) recorrer(raiz, new THREE.Matrix4(), [])
  return resultado
}

function hijosDe(doc: Documento, nombre: string): string[] {
  const nodo = doc.nodes.find((n) => n.name === nombre)
  return (nodo?.children ?? []).map((i) => doc.nodes[i].name ?? '')
}

/** Lo que `GLTFLoader` sabe leer con el cargador del lienzo (Draco y Meshopt puestos). */
const EXTENSIONES_QUE_SE_LEEN = new Set([
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_materials_unlit',
  'KHR_texture_transform',
  'KHR_mesh_quantization',
])

describe('la mesa de la arsenalera (mesa-arsenalera.glb)', () => {
  const doc = leer('mesa-arsenalera.glb')
  const c = cajas(doc)

  it('trae los nodos que busca la escena, con la funda y el instrumental dentro de lo que sube', () => {
    // Vacía, una caja haría pasar en falso las comparaciones de abajo (su máximo es −∞).
    for (const nombre of ['mesa-arsenalera', 'base', 'elevable', 'bandeja', 'funda', 'sombra']) expect(c.get(nombre)?.isEmpty(), nombre).toBe(false)
    expect(hijosDe(doc, 'elevable')).toEqual(expect.arrayContaining(['bandeja', 'funda', 'instrumental']))
    // La escena sube la bandeja escribiendo `elevable.position.y`: una traslación de fábrica se perdería.
    expect(doc.nodes.find((n) => n.name === 'elevable')?.translation ?? [0, 0, 0]).toEqual([0, 0, 0])
  })

  it('solo pide extensiones que el lienzo sabe abrir', () => {
    for (const e of doc.extensionsRequired ?? []) expect(EXTENSIONES_QUE_SE_LEEN.has(e), e).toBe(true)
  })

  it('la bandeja está a la altura que suponen los sitios, y la base cabe en la huella que ellos apartan', () => {
    const bandeja = c.get('bandeja')!
    expect(bandeja.max.y).toBeGreaterThanOrEqual(M.alturaDeLaBandeja)
    expect(bandeja.max.y).toBeLessThan(M.alturaDeLaBandeja + 0.05)
    const base = c.get('base')!
    expect(base.min.y).toBeCloseTo(0, 2)
    expect(-base.min.x).toBeLessThanOrEqual(M.delCentroAlPoste + 0.12)
    expect(base.max.x).toBeLessThanOrEqual(M.medioLargoDeLaBandeja)
    expect(Math.max(-base.min.z, base.max.z)).toBeLessThanOrEqual(M.medioAnchoDeLaBase)
  })

  it('pesa lo que se puede bajar al abrir un caso', () => {
    expect(statSync(resolve(PUBLICO, 'mesa-arsenalera.glb')).size).toBeLessThan(3 * 1024 * 1024)
  })
})

describe('la mesa quirúrgica (mesa-quirurgica.glb)', () => {
  const doc = leer('mesa-quirurgica.glb')
  const c = cajas(doc)

  it('va en el marco del colchón: el tablero bajo él y del mismo ancho, y la base en el suelo', () => {
    for (const nombre of ['tablero', 'columna', 'base', 'sombra']) expect(c.get(nombre)?.isEmpty(), nombre).toBe(false)
    const tablero = c.get('tablero')!
    expect(tablero.max.y).toBeLessThanOrEqual(0)
    expect(Math.max(-tablero.min.x, tablero.max.x)).toBeLessThanOrEqual(M.medioAnchoDelColchon)
    expect(Math.max(-tablero.min.z, tablero.max.z)).toBeLessThanOrEqual(M.medioLargoDelColchon)
    expect(c.get('base')!.min.y).toBeCloseTo(M.suelo, 2)
  })

  it('solo pide extensiones que el lienzo sabe abrir', () => {
    for (const e of doc.extensionsRequired ?? []) expect(EXTENSIONES_QUE_SE_LEEN.has(e), e).toBe(true)
  })

  it('ningún sitio fijo mete la base de la arsenalera en la de la camilla', () => {
    // La huella de la base de la arsenalera, como en `mesaDeArsenalera.test.ts`, contra la base y la columna de la
    // camilla en planta. Las dos van en el suelo, así que basta la planta.
    const obstaculos = ['base', 'columna', 'mando'].map((n) => c.get(n)).filter((b): b is THREE.Box3 => !!b)
    const huella = (s: ColocacionDeLaMesa) => {
      const largo = haciaLaBandeja(s.giro)
      const ancho = { x: -largo.z, z: largo.x }
      const caja = new THREE.Box3()
      for (const a of [-(M.delCentroAlPoste + 0.12), M.medioLargoDeLaBandeja]) {
        for (const b of [-M.medioAnchoDeLaBase, M.medioAnchoDeLaBase]) {
          caja.expandByPoint(new THREE.Vector3(s.x + largo.x * a + ancho.x * b, 0, s.z + largo.z * a + ancho.z * b))
        }
      }
      return caja
    }
    for (const decubito of ['supino', 'prono'] as const) {
      for (const lugar of ['derecha', 'izquierda', 'pies', 'encima'] as const) {
        for (const zDeLaZona of [-0.6, 0, 0.5, 0.8]) {
          const planta = huella(colocarLaMesa(lugar, { decubito, zDeLaZona }))
          for (const o of obstaculos) {
            const choca = planta.min.x < o.max.x && planta.max.x > o.min.x && planta.min.z < o.max.z && planta.max.z > o.min.z
            expect(choca, `${lugar}, ${decubito}, zona ${zDeLaZona}`).toBe(false)
          }
        }
      }
    }
  })

  it('pesa poco: es un mueble de fondo', () => {
    expect(statSync(resolve(PUBLICO, 'mesa-quirurgica.glb')).size).toBeLessThan(1.5 * 1024 * 1024)
  })
})
