import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { colocarALaArsenalera, colocarLaMesa, haciaLaBandeja, MEDIDAS_DE_LA_SALA as M, type ColocacionDeLaMesa } from '@/lib/mesaDeArsenalera'
import { PREFIJO_DE_LO_QUE_CUELGA, recibeSombra } from '@/lib/pabellonCompleto'

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

const PABELLON = resolve(process.cwd(), 'privado', 'pabellon')

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
  materials?: { name?: string; doubleSided?: boolean }[]
  cameras?: unknown[]
  extensions?: Record<string, unknown>
  nodes: Nodo[]
  meshes: { primitives: { attributes: { POSITION: number } }[] }[]
  accessors: { min?: number[]; max?: number[] }[]
  extensionsUsed?: string[]
  extensionsRequired?: string[]
}

function leer(archivo: string): Documento {
  const bytes = readFileSync(resolve(PABELLON, archivo))
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
    expect(statSync(resolve(PABELLON, 'mesa-arsenalera.glb')).size).toBeLessThan(3 * 1024 * 1024)
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
    expect(statSync(resolve(PABELLON, 'mesa-quirurgica.glb')).size).toBeLessThan(1.5 * 1024 * 1024)
  })
})

describe('la arsenalera de pie (arsenalera-persona.glb)', () => {
  const archivo = 'arsenalera-persona.glb'
  const doc = leer(archivo)
  const c = cajas(doc)
  /** Todo lo de ella menos la sombra, que es un plano de un metro en el suelo y estiraría cualquier caja. */
  const PIEZAS = ['bata', 'pantalon', 'guantes', 'zapatos', 'cabeza', 'cara', 'gorro', 'mascarilla', 'gafas']

  it('trae los nodos que la escena pincha, y la cara de la foto', () => {
    // `mesaEnLaEscena.ts` arma las cajas del rayo con la bata, los guantes y el gorro. Los ojos y las cejas, que pidió el
    // dueño, van desde D-418 en la foto de la cara y no en mallas aparte: sin `cara` no habría rostro, y una exportación
    // que la dejara fuera no daría ningún error.
    for (const nombre of ['arsenalera-persona', ...PIEZAS, 'sombra']) {
      expect(c.get(nombre)?.isEmpty(), nombre).toBe(false)
    }
  })

  it('solo pide extensiones que el lienzo sabe abrir, y no la transmisión de las gafas', () => {
    for (const e of doc.extensionsRequired ?? []) expect(EXTENSIONES_QUE_SE_LEEN.has(e), e).toBe(true)
    // `KHR_materials_transmission` obliga a three a dibujar la escena entera una vez más en cada cuadro, para lo que se
    // ve a través de unas gafas de cinco centímetros. Van con transparencia simple.
    expect(doc.extensionsUsed ?? []).not.toContain('KHR_materials_transmission')
  })

  it('de pie en el suelo, con la estatura de una persona y la cofia puesta', () => {
    expect(c.get('zapatos')!.min.y).toBeCloseTo(0, 2)
    const gorro = c.get('gorro')!
    expect(gorro.max.y).toBeGreaterThan(1.65)
    expect(gorro.max.y).toBeLessThan(1.82)
    // Mirando a +Z, que es lo que supone el giro de `colocarALaArsenalera`: la cara por delante de la nuca.
    expect(c.get('cara')!.max.z).toBeGreaterThan(c.get('cabeza')!.max.z - 0.05)
    expect(c.get('cara')!.min.z).toBeGreaterThan(0)
  })

  it('con los brazos abajo, nada de ella llega a la funda de su mesa', () => {
    // La figura del dueño no apoya las manos en la bandeja (D-418): se para donde se paraba la anterior, que sí, y la
    // bandeja le queda delante. Lo que no puede pasar es que algo suyo, una mano adelantada o la punta de un pie, se
    // meta en la funda que cuelga de la bandeja. La funda se mide en su `.glb`: el poste va hacia −X, y a lo ancho, Z.
    const funda = cajas(leer('mesa-arsenalera.glb')).get('funda')!
    const fundaDesdeElEje = Math.max(-funda.min.z, funda.max.z)
    const frente = Math.max(...PIEZAS.map((nombre) => c.get(nombre)!.max.z))
    expect(frente).toBeLessThan(M.delEjeDeLaBandejaALaPersona - fundaDesdeElEje - 0.02)
  })

  it('cabe donde la ponen: los pies en su huella y la bata en su radio', () => {
    const zapatos = c.get('zapatos')!
    expect(Math.max(-zapatos.min.x, zapatos.max.x, -zapatos.min.z, zapatos.max.z)).toBeLessThanOrEqual(M.radioDeLosPies)
    const tela = c.get('bata')!
    expect(Math.max(-tela.min.x, tela.max.x, -tela.min.z, tela.max.z)).toBeLessThanOrEqual(M.radioDeLaPersona)
    // El ruedo baja casi hasta el suelo, sin tocarlo. Que lo que baja hasta las patas de la mesa quepa en la huella de
    // los pies lo comprueba `arsenalera_a_la_web.py` al exportar: aquí se leen cajas, y la de la bata la abre la falda a
    // media pierna, donde ya no hay patas.
    expect(tela.min.y).toBeGreaterThan(0.02)
  })

  it('pesa poco para lo que es: la bajan todos los que abren un caso con ella puesta', () => {
    expect(statSync(resolve(PABELLON, archivo)).size).toBeLessThan(1.2 * 1024 * 1024)
  })
})

describe('el pabellón (sala.glb)', () => {
  const archivo = 'sala.glb'
  const doc = leer(archivo)
  const c = cajas(doc)
  const raices = doc.scenes[0].nodes.map((i) => doc.nodes[i].name)
  const materiales = (doc.materials ?? []).map((m) => m.name ?? '')

  it('trae los tres grupos que la escena distingue, y lo que cuelga con su prefijo', () => {
    expect(raices.sort()).toEqual(['colgantes', 'equipos', 'estructura'])
    // `recintoEnLaEscena.ts` aparta lo que cuelga buscándolo por el prefijo: uno sin él taparía al paciente desde
    // arriba sin que nada lo quitara.
    const colgantes = hijosDe(doc, 'colgantes')
    expect(colgantes.length).toBeGreaterThan(0)
    for (const nombre of colgantes) expect(nombre.startsWith(PREFIJO_DE_LO_QUE_CUELGA), nombre).toBe(true)
  })

  it('lo que cuelga pasa sobre la cabeza de quien está de pie', () => {
    // Una arsenalera con el gorro llega a 1,75 m: un brazo de techo más bajo la atravesaría al pasar junto a la camilla.
    for (const nombre of hijosDe(doc, 'colgantes')) expect(c.get(nombre)!.min.y - M.suelo, nombre).toBeGreaterThan(1.75)
  })

  it('el piso está donde la escena pone el suelo, y es lo único que recibe sombra', () => {
    expect(c.get('piso')!.max.y).toBeCloseTo(M.suelo, 2)
    expect(materiales.filter(recibeSombra)).toEqual(['piso-vinilo'])
  })

  it('las superficies son de una cara, para ver la sala desde fuera y desde arriba', () => {
    // Una pared de dos caras taparía al paciente cada vez que la cámara sale de la sala, que es casi siempre.
    for (const m of doc.materials ?? []) expect(m.doubleSided ?? false, m.name).toBe(false)
  })

  it('se puede repintar: paredes, techo, zócalo y puertas llevan material de pintura', () => {
    for (const nombre of ['pintura-pared', 'pintura-techo', 'pintura-zocalo', 'pintura-puerta']) expect(materiales, nombre).toContain(nombre)
  })

  it('no trae luces ni cámaras: las pone el simulador', () => {
    expect(doc.extensions?.KHR_lights_punctual).toBeUndefined()
    expect(doc.cameras ?? []).toHaveLength(0)
  })

  it('solo pide extensiones que el lienzo sabe abrir', () => {
    for (const e of doc.extensionsRequired ?? []) expect(EXTENSIONES_QUE_SE_LEEN.has(e), e).toBe(true)
  })

  it('deja libre el suelo por donde se mueven la mesa y la arsenalera', () => {
    // La zona libre que se le pidió al guion: a los lados de la camilla y a sus pies. En la cabecera, por debajo de
    // z = −1,3, va el equipo de anestesia.
    const libre = { x: 2, desdeZ: -1.3, hastaZ: 2.6 }
    for (const nombre of hijosDe(doc, 'equipos')) {
      const caja = c.get(nombre)!
      // Solo lo que se apoya en el suelo: lo colgado de la pared no estorba a los pies.
      if (caja.min.y > M.suelo + 0.02) continue
      const entra = caja.min.x < libre.x && caja.max.x > -libre.x && caja.min.z < libre.hastaZ && caja.max.z > libre.desdeZ
      expect(entra, nombre).toBe(false)
    }
    // Y los sitios fijos caen dentro de ella, con los pies de la arsenalera.
    for (const decubito of ['supino', 'prono'] as const) {
      for (const lugar of ['derecha', 'izquierda', 'pies', 'encima'] as const) {
        for (const zDeLaZona of [-0.6, 0, 0.5, 0.8]) {
          const p = colocarALaArsenalera(colocarLaMesa(lugar, { decubito, zDeLaZona }))
          const donde = `${lugar}, ${decubito}, zona ${zDeLaZona}`
          expect(Math.abs(p.x) + M.radioDeLosPies, donde).toBeLessThanOrEqual(libre.x)
          expect(p.z - M.radioDeLosPies, donde).toBeGreaterThanOrEqual(libre.desdeZ)
          expect(p.z + M.radioDeLosPies, donde).toBeLessThanOrEqual(libre.hastaZ)
        }
      }
    }
  })

  it('pesa lo que se puede bajar después de los muebles', () => {
    expect(statSync(resolve(PABELLON, archivo)).size).toBeLessThan(3.5 * 1024 * 1024)
  })
})
