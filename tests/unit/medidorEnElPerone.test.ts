import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import * as THREE from 'three'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { ejeDelHueso } from '@/lib/planoDeCorte'
import { medirAlLoLargoDeUnaLinea } from '@/components/simulador/implantesEnLaEscena'
import { HUECO_DE_UN_TRAZO_MM, huesoDelNodo, salidaPorLaCorticalOpuesta } from '@/lib/profundidadDeLaBroca'

/**
 * El medidor sobre el peroné del atlas (P-013, pedido 9 de Cristóbal): «usé el medidor para brocar la fíbula y me daba
 * como 60 mm; habitualmente, y lo que me terminó saliendo bien, son tornillos de 12 mm aprox.».
 *
 * D-269 ya había quitado el tope de 60 mm y hecho que el medidor, la broca y la vista previa contaran igual, pero dejaba
 * pasar la línea a **otra pieza** si estaba a menos de 3 mm, para que los dos fragmentos de una fractura reducida contaran
 * como un hueso. En el tobillo, el peroné toca la tibia en la sindesmosis y el astrágalo en la mortaja a menos de eso, y
 * una exportación del taller, que separa cada hueso, los deja como piezas aparte: el tornillo del peroné distal medía el
 * peroné, la articulación y el astrágalo, o la tibia entera. Ahora solo se pasa entre trozos del mismo hueso.
 *
 * Con las mallas de verdad, en metros y nombradas como las nombra la exportación, y con la línea de lateral a medial que
 * sigue el tornillo de una placa lateral de peroné.
 */

const ATLAS = join(process.cwd(), 'public', 'atlas')
const catalogo = JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8')) as CatalogoDelAtlas
const paquetes = new Map<number, ArrayBuffer>()
function leer(p: PiezaDelAtlas) {
  if (!paquetes.has(p.paquete)) {
    const crudo = gunzipSync(readFileSync(join(ATLAS, catalogo.paquetes[p.paquete].archivo)))
    paquetes.set(p.paquete, crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + crudo.byteLength))
  }
  const b = paquetes.get(p.paquete)!
  return {
    posiciones: new Float32Array(new Float32Array(b, p.pos, p.vertices * 3)),
    normales: new Int16Array(new Int16Array(b, p.nor, p.vertices * 3)),
    indices: new Uint32Array(new Uint32Array(b, p.idx, p.indices)),
  }
}
const pieza = (id: string) => catalogo.piezas.find((q) => q.id === id)!

function malla(id: string, nombre: string): THREE.Mesh {
  const m = leer(pieza(id))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.posiciones, 3))
  g.setIndex(new THREE.BufferAttribute(m.indices, 1))
  g.computeVertexNormals()
  // De una cara, como el material del simulador: el medidor tiene que encontrar la salida igual (dos pasadas).
  const objeto = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }))
  objeto.name = nombre
  objeto.updateMatrixWorld(true)
  return objeto
}

// Los nombres de nodo que da la exportación del taller con las estructuras separadas (`nombreDeNodo` de la etiqueta).
const perone = malla('FJ3366', 'Perone_derecho')
const tibia = malla('FJ3387', 'Tibia_derecha')
const astragalo = malla('FJ3385', 'Astragalo_derecho')
const huesos = [perone, tibia, astragalo]

const mallaDelPerone = leer(pieza('FJ3366'))
const eje = ejeDelHueso(mallaDelPerone.posiciones, mallaDelPerone.indices)!
const centro = new THREE.Vector3(...eje.centro)
const direccion = new THREE.Vector3(...eje.direccion).normalize()
/** Un punto del eje del peroné a esa fracción de su largo, desde proximal. */
const enElEje = (fraccion: number) => centro.clone().addScaledVector(direccion, eje.proximal + fraccion * (eje.distal - eje.proximal))
/** La pierna derecha del atlas mira con su lado lateral hacia −x: el tornillo entra desde ahí, hacia medial. */
const HACIA_MEDIAL = new THREE.Vector3(1, 0, 0)

function medirA(fraccion: number) {
  const p = enElEje(fraccion)
  // Desde 3 cm por fuera: el medidor busca él mismo la cortical cercana.
  const origen = p.clone().addScaledVector(HACIA_MEDIAL, -0.03)
  return medirAlLoLargoDeUnaLinea(origen, HACIA_MEDIAL, 1000, huesos)
}

describe('el medidor en el peroné del atlas (P-013, pedido 9)', () => {
  it.each([0.3, 0.5, 0.7, 0.85, 0.92, 0.96])('a %s del largo mide el peroné y no el hueso de al lado', (fraccion) => {
    const medida = medirA(fraccion)
    expect(medida).not.toBeNull()
    // El peroné del atlas mide de 9 a 25 mm de lado a lado según la altura (el maléolo es lo más ancho): nunca 40 o 60.
    expect(medida!.espesorMm).toBeGreaterThan(6)
    expect(medida!.espesorMm).toBeLessThan(28)
  })

  it('en el maléolo, la línea que sigue de largo toca la tibia o el astrágalo a menos de 3 mm: es lo que contaba de más', () => {
    // Lo que daba la regla anterior, con la identidad del objeto y nada más, en las alturas del tobillo.
    const antes = [0.92, 0.96].map((f) => {
      const p = enElEje(f).addScaledVector(HACIA_MEDIAL, -0.03)
      const r = new THREE.Raycaster(p, HACIA_MEDIAL, 0, 0.12)
      const cruces = r
        .intersectObjects(huesos, false)
        .map((g) => ({ distanciaMm: g.distance * 1000, pieza: g.object }))
      const vueltos = new THREE.Raycaster(p.clone().addScaledVector(HACIA_MEDIAL, 0.12), HACIA_MEDIAL.clone().negate(), 0, 0.12)
        .intersectObjects(huesos, false)
        .map((g) => ({ distanciaMm: (0.12 - g.distance) * 1000, pieza: g.object }))
      const todos = [...cruces, ...vueltos].sort((a, b) => a.distanciaMm - b.distanciaMm)
      const cercana = todos[0].distanciaMm
      return salidaPorLaCorticalOpuesta(todos.filter((c) => c.distanciaMm > cercana + 0.01).map((c) => ({ ...c, distanciaMm: c.distanciaMm - cercana })))
    })
    expect(Math.max(...antes.map((x) => x ?? 0))).toBeGreaterThan(30)
  })
})

describe('qué hueso es cada pieza', () => {
  it('los dos trozos de un hueso partido son el mismo hueso; el peroné y la tibia, no', () => {
    expect(huesoDelNodo('Tibia_derecha_fragmento_proximal')).toBe(huesoDelNodo('Tibia_derecha_fragmento_distal'))
    expect(huesoDelNodo('Tibia_derecha_fragmento_distal')).toBe('Tibia_derecha')
    expect(huesoDelNodo('Perone_derecho')).not.toBe(huesoDelNodo('Tibia_derecha'))
  })

  it('la línea pasa entre trozos del mismo hueso dentro del trazo, y nunca a otro hueso', () => {
    const proximal = { hueso: 'Tibia_derecha' }
    const distal = { hueso: 'Tibia_derecha' }
    const otro = { hueso: 'Perone_derecho' }
    const mismo = (a: { hueso: string }, b: { hueso: string }) => a.hueso === b.hueso
    // Un trazo reducido de 1 mm entre los dos trozos: un hueso de 28 mm.
    expect(salidaPorLaCorticalOpuesta([{ distanciaMm: 12, pieza: proximal }, { distanciaMm: 13, pieza: distal }, { distanciaMm: 28, pieza: distal }], HUECO_DE_UN_TRAZO_MM, mismo)).toBe(28)
    // Otro hueso a 1 mm: se queda en el primero.
    expect(salidaPorLaCorticalOpuesta([{ distanciaMm: 12, pieza: proximal }, { distanciaMm: 13, pieza: otro }, { distanciaMm: 40, pieza: otro }], HUECO_DE_UN_TRAZO_MM, mismo)).toBe(12)
    // Sin la regla del hueso, la de antes: a otra pieza dentro de 3 mm.
    expect(salidaPorLaCorticalOpuesta([{ distanciaMm: 12, pieza: proximal }, { distanciaMm: 13, pieza: otro }, { distanciaMm: 40, pieza: otro }])).toBe(40)
  })
})
