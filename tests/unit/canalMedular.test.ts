import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import * as THREE from 'three'
import { triangulosDelCanal, verticesDelCanal } from '@/lib/canalMedular'
import { tapasDeCorte, verticesDeLasTapas } from '@/lib/aspectoAnatomico'
import { partirMalla, type MallaIndexada } from '@/lib/osteotomia'
import { ejeDelHueso, planoDelCorte, type Vector3 } from '@/lib/planoDeCorte'
import { CABEZAS_DE_FRESA_MM, juzgarElFresado } from '@/lib/enclavado'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { ATRIBUTO_DEL_CANAL, SIN_CANAL_POR_OMISION, marcarElCanal } from '@/atlas/canalDeLaGeometria'
import { crearMaterialDeRadiografia } from '@/atlas/materialDeRadiografia'
import { nubeDeLaGeometria } from '@/components/simulador/asientoDeLaPlaca'
import { istmoDelHueso } from '@/components/simulador/enclavadoEnLaEscena'

/**
 * El canal medular de los huesos largos (P-012 E7, D-335 y D-336).
 *
 * Dos mitades, como la prueba de la piel. Con tubos hechos a mano, que tienen respuesta conocida: qué es canal y qué no,
 * entero, partido y con las caras al revés. Y con el atlas de verdad: que los catorce huesos están rehechos y con su
 * canal, que el canal se reconoce por la forma justo donde el catálogo dice que empieza, y que su eje es el de antes,
 * porque sobre ese eje están escritos los cortes de los casos guardados.
 */

// --------------------------------------------------------------------------------- tubos hechos a mano

/** Una geometría de three a la forma del atlas; `alReves` le da la vuelta a cada triángulo. */
function deThree(g: THREE.BufferGeometry, alReves = false): MallaIndexada {
  const idx = Uint32Array.from(g.getIndex()!.array)
  if (alReves) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]]
  const normales = Float32Array.from(g.getAttribute('normal').array as Float32Array, (x) => (alReves ? -x : x))
  return { posiciones: new Float32Array(g.getAttribute('position').array), normales, indices: idx }
}

function juntar(...mallas: MallaIndexada[]): MallaIndexada {
  const vertices = mallas.reduce((s, m) => s + m.posiciones.length / 3, 0)
  const posiciones = new Float32Array(vertices * 3)
  const normales = new Float32Array(vertices * 3)
  const indices = new Uint32Array(mallas.reduce((s, m) => s + m.indices.length, 0))
  let v = 0
  let i = 0
  for (const m of mallas) {
    posiciones.set(m.posiciones, v * 3)
    normales.set(m.normales as Float32Array, v * 3)
    for (let k = 0; k < m.indices.length; k++) indices[i + k] = m.indices[k] + v
    v += m.posiciones.length / 3
    i += m.indices.length
  }
  return { posiciones, normales, indices }
}

/**
 * Una diáfisis de juguete, en metros: un tubo de 12 mm de radio y 30 cm, y dentro un canal de 6 mm de radio y 20 cm,
 * con las caras hacia dentro de él. Abiertos por los extremos a propósito: la tapa plana de un cilindro de three lleva
 * todos sus vértices con la misma normal y en el mismo plano, que es justo como se reconoce una tapa de corte, y la
 * prueba contaría tapas que no son de ningún corte. CylinderGeometry repite los vértices de la costura, como el atlas.
 */
const RADIO_DE_FUERA = 0.012
const RADIO_DEL_CANAL = 0.006
const fuera = (alReves = false) => deThree(new THREE.CylinderGeometry(RADIO_DE_FUERA, RADIO_DE_FUERA, 0.3, 32, 6, true), alReves)
const canal = () => deThree(new THREE.CylinderGeometry(RADIO_DEL_CANAL, RADIO_DEL_CANAL, 0.2, 24, 4, true), true)
const triangulos = (m: MallaIndexada) => m.indices.length / 3
const suma = (marca: Uint8Array) => marca.reduce((s, m) => s + m, 0)

describe('el canal, en una diáfisis de juguete', () => {
  it('es canal la cáscara de dentro, y nada de la de fuera', () => {
    const f = fuera()
    const hueso = juntar(f, canal())
    const marca = triangulosDelCanal(hueso.posiciones, hueso.indices)
    expect(suma(marca.slice(0, triangulos(f)))).toBe(0)
    expect(suma(marca.slice(triangulos(f)))).toBe(triangulos(canal()))
    // Y en los vértices: los del canal, solos.
    const v = verticesDelCanal(hueso.posiciones, hueso.indices)
    expect(suma(v.slice(0, f.posiciones.length / 3))).toBe(0)
    expect(suma(v.slice(f.posiciones.length / 3))).toBe(canal().posiciones.length / 3)
  })

  it('un hueso sin canal, o con todas las caras al revés, no tiene canal', () => {
    // El segundo es el que importa: una pieza vuelta del revés es una sola parte, sin nada fuera que la contenga, y
    // tomarla por canal la pintaría de médula y la borraría de la radiografía.
    for (const m of [fuera(), fuera(true)]) expect(suma(triangulosDelCanal(m.posiciones, m.indices))).toBe(0)
  })

  it('mide solo el tramo pedido, como dentro de la malla fundida de un sistema', () => {
    const otro = juntar(fuera(), canal())
    const todo = juntar(otro, fuera(), canal())
    const inicio = otro.indices.length
    const marca = triangulosDelCanal(todo.posiciones, todo.indices, { inicio, cuenta: todo.indices.length - inicio })
    expect(marca.length).toBe((todo.indices.length - inicio) / 3)
    expect(suma(marca)).toBe(triangulos(canal()))
    expect(suma(marca.slice(triangulos(fuera())))).toBe(triangulos(canal()))
  })

  it('partida por la mitad, cada trozo sigue con su canal, y la tapa es un anillo', () => {
    const hueso = juntar(fuera(), canal())
    const r = partirMalla(hueso, { punto: [0, 0.013, 0], normal: [0, 1, 0] })
    for (const trozo of [r.haciaLaNormal, r.contraLaNormal]) {
      const tapas = tapasDeCorte(trozo.posiciones, trozo.normales, trozo.indices)
      expect(tapas).toHaveLength(1)
      expect(tapas[0].agujeros).toBe(1)
      const excluir = verticesDeLasTapas(trozo.posiciones, trozo.normales)
      const marca = triangulosDelCanal(trozo.posiciones, trozo.indices, { excluir })
      // Canal es lo que queda a 6 mm del eje, y nada de la tapa, que va de 6 a 12 mm: sin excluirla, el anillo uniría
      // las dos cáscaras y no habría canal.
      let mal = 0
      let delCanal = 0
      for (let t = 0; t < marca.length; t++) {
        const v = [0, 1, 2].map((k) => trozo.indices[3 * t + k])
        const p = v.map((i) => new THREE.Vector3(trozo.posiciones[3 * i], trozo.posiciones[3 * i + 1], trozo.posiciones[3 * i + 2]))
        const doble = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).length()
        if (doble === 0) continue
        const deLaTapa = v.every((i) => excluir[i] === 1)
        const radio = Math.hypot((p[0].x + p[1].x + p[2].x) / 3, (p[0].z + p[1].z + p[2].z) / 3)
        const esperado = !deLaTapa && radio < (RADIO_DE_FUERA + RADIO_DEL_CANAL) / 2 ? 1 : 0
        if (marca[t] !== esperado) mal++
        delCanal += marca[t]
      }
      expect(mal).toBe(0)
      expect(delCanal).toBeGreaterThan(triangulos(canal()) / 3)
    }
  })

  it('sin canal, la tapa del corte es un disco', () => {
    const r = partirMalla(fuera(), { punto: [0, 0.013, 0], normal: [0, 1, 0] })
    const tapas = tapasDeCorte(r.haciaLaNormal.posiciones, r.haciaLaNormal.normales, r.haciaLaNormal.indices)
    expect(tapas).toHaveLength(1)
    expect(tapas[0].agujeros).toBe(0)
  })
})

/** La malla de juguete como geometría de three, que es como la ven la escena y la radiografía. */
function geometriaDe(m: MallaIndexada) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.posiciones, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(m.normales, 3))
  g.setIndex(new THREE.BufferAttribute(m.indices, 1))
  return g
}

describe('lo que lee el canal en la escena', () => {
  it('la geometría lleva el canal en `aCanal`, calculado una vez, y la que no tiene, a cero', () => {
    const f = fuera()
    const g = geometriaDe(juntar(f, canal()))
    expect(marcarElCanal(g)).toBe(true)
    const marca = g.getAttribute(ATRIBUTO_DEL_CANAL)
    const desde = f.posiciones.length / 3
    for (let i = 0; i < marca.count; i++) expect(marca.getX(i)).toBe(i < desde ? 0 : 1)
    expect(marcarElCanal(g)).toBe(true)
    expect(g.getAttribute(ATRIBUTO_DEL_CANAL)).toBe(marca)
    // Sin canal, el atributo también: el sombreador lo lee en toda malla de hueso.
    const sin = geometriaDe(fuera())
    expect(marcarElCanal(sin)).toBe(false)
    expect(Array.from(sin.getAttribute(ATRIBUTO_DEL_CANAL).array).every((x) => x === 0)).toBe(true)
  })

  it('la radiografía no suma la pared del canal, y lo que no trae el atributo lo lee a cero', () => {
    const m = crearMaterialDeRadiografia(1)
    expect(m.vertexShader).toContain(`attribute float ${ATRIBUTO_DEL_CANAL};`)
    expect(m.fragmentShader).toContain('if (vCanal > 0.5) discard;')
    // Los de three se quedan: el color por vértice de lo que no lo trae sigue siendo blanco.
    expect(m.defaultAttributeValues).toMatchObject({ ...SIN_CANAL_POR_OMISION, color: [1, 1, 1] })
  })

  it('la placa no apoya en la pared del canal: la nube del hueso es solo su cara de fuera', () => {
    // En milímetros, como la escena del asiento; sin esto la normal media de un sitio mezclaba caras que miran hacia
    // dentro del hueso.
    const enMm = (m: MallaIndexada) => ({ ...m, posiciones: Float32Array.from(m.posiciones, (x) => x * 1000) })
    const nube = nubeDeLaGeometria(geometriaDe(enMm(juntar(fuera(), canal()))), 1.5)
    let dentro = 0
    for (let i = 0; i < nube.posiciones.length; i += 3) if (Math.hypot(nube.posiciones[i], nube.posiciones[i + 2]) < 9) dentro++
    expect(nube.posiciones.length).toBeGreaterThan(0)
    expect(dentro).toBe(0)
  })

  it('el istmo del hueso se busca en el nodo y en sus padres, y sin él no hay', () => {
    const grupo = new THREE.Group()
    grupo.userData.istmoMm = 10.8
    const primitiva = new THREE.Mesh()
    grupo.add(primitiva)
    expect(istmoDelHueso(primitiva)).toBe(10.8)
    expect(istmoDelHueso(new THREE.Mesh())).toBeNull()
    expect(istmoDelHueso(null)).toBeNull()
  })
})

// ----------------------------------------------------------------------------------- el atlas de verdad

const ATLAS = join(process.cwd(), 'public', 'atlas')
const catalogo = JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8')) as CatalogoDelAtlas
const paquetes = new Map<number, ArrayBuffer>()
function leer(p: PiezaDelAtlas): MallaIndexada {
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

/**
 * El eje de cada hueso de BodyParts3D tal como estaba antes de E7 (`ejeDelHueso` sobre los paquetes de e03f345), en
 * metros. Los cortes de los casos guardados se escribieron sobre él, y el hueso nuevo tiene que dar el mismo.
 */
const EJE_DE_ANTES: Record<string, { centro: Vector3; direccion: Vector3; proximal: number; distal: number }> = {
  FJ3259: { centro: [0.09358, 0.66756, -0.01496], direccion: [-0.09085, -0.99559, 0.02354], proximal: -0.24317, distal: 0.22394 },
  FJ3365: { centro: [-0.09355, 0.66746, -0.01497], direccion: [0.09101, -0.99557, 0.02359], proximal: -0.24291, distal: 0.22396 },
  FJ3282: { centro: [0.07665, 0.28652, -0.0145], direccion: [-0.01008, -0.99961, -0.02598], proximal: -0.16519, distal: 0.21463 },
  FJ3387: { centro: [-0.07667, 0.2868, -0.01442], direccion: [0.00979, -0.9996, -0.02642], proximal: -0.16496, distal: 0.21488 },
  FJ3260: { centro: [0.10079, 0.24718, -0.03935], direccion: [-0.03244, -0.99944, -0.00849], proximal: -0.18999, distal: 0.19407 },
  FJ3366: { centro: [-0.10079, 0.24716, -0.03931], direccion: [0.03274, -0.99942, -0.009], proximal: -0.18984, distal: 0.19439 },
  FJ3262: { centro: [0.19143, 1.26478, -0.02979], direccion: [0.16988, -0.98421, -0.04974], proximal: -0.15314, distal: 0.15639 },
  FJ3368: { centro: [-0.19144, 1.26473, -0.02985], direccion: [-0.17008, -0.98416, -0.05005], proximal: -0.15296, distal: 0.15621 },
  FJ3277: { centro: [0.24823, 0.99506, -0.00759], direccion: [0.15525, -0.97062, 0.18385], proximal: -0.12098, distal: 0.11684 },
  FJ3349: { centro: [-0.24849, 0.99402, -0.00745], direccion: [-0.15457, -0.97048, 0.18515], proximal: -0.12167, distal: 0.11594 },
  FJ3286: { centro: [0.22178, 1.02491, -0.02036], direccion: [0.11938, -0.96108, 0.24914], proximal: -0.1089, distal: 0.1461 },
  FJ3391: { centro: [-0.22183, 1.02496, -0.02039], direccion: [-0.12001, -0.96107, 0.24888], proximal: -0.10894, distal: 0.1462 },
  FJ3237: { centro: [0.07715, 1.41498, 0.00277], direccion: [0.78148, 0.20002, -0.591], proximal: -0.07578, distal: 0.07612 },
  FJ3362: { centro: [-0.0785, 1.41498, 0.00275], direccion: [-0.78165, 0.20013, -0.59073], proximal: -0.07584, distal: 0.07601 },
}
const LARGOS = Object.keys(EJE_DE_ANTES)

describe('los huesos largos del atlas', () => {
  it('son los catorce, rehechos con su canal y su istmo (D-335 y D-336)', () => {
    // Si alguien regenera el atlas con `preparar.mjs` y se olvida de volver a pasar `generar.py` y `poner-huesos.mjs`,
    // los huesos vuelven a ser los de BodyParts3D: esta es la prueba que lo dice.
    const rehechos = catalogo.piezas.filter((p) => p.rehecha)
    expect(rehechos.map((p) => p.id).sort()).toEqual([...LARGOS].sort())
    for (const p of rehechos) {
      expect(p.rehecha).toMatch(/^D-335 y D-336/)
      expect(p.canal!.vertice).toBeGreaterThan(0)
      expect(p.canal!.vertice).toBeLessThan(p.vertices)
      expect(p.canal!.indice % 3).toBe(0)
      expect(p.istmoMm).toBeGreaterThan(3)
    }
  })

  it.each(LARGOS)('%s: el canal se reconoce por la forma justo donde el catálogo dice que empieza', (id) => {
    const p = pieza(id)
    const { posiciones, indices } = leer(p)
    const marca = triangulosDelCanal(posiciones, indices)
    const desde = p.canal!.indice / 3
    expect(marca.indexOf(1)).toBe(desde)
    expect(suma(marca.slice(desde))).toBe(marca.length - desde)
    // Las dos cáscaras no comparten un vértice: la de fuera usa los de antes de `canal.vertice`, el canal los demás.
    let cruzados = 0
    for (let k = 0; k < indices.length; k++) if (indices[k] < p.canal!.vertice !== k < p.canal!.indice) cruzados++
    expect(cruzados).toBe(0)
  })

  it.each(LARGOS)('%s: las dos cáscaras están cerradas, y el canal dentro', (id) => {
    const p = pieza(id)
    const { posiciones, indices } = leer(p)
    for (const [inicio, fin] of [
      [0, p.canal!.indice],
      [p.canal!.indice, p.indices],
    ]) {
      // Cerrada y sin aristas de más: cada arista, una vez en cada sentido. Por índice, porque los huesos rehechos no
      // repiten vértices en las costuras como los de BodyParts3D.
      const usos = new Map<number, number>()
      const clave = (a: number, b: number) => a * p.vertices + b
      for (let t = inicio; t < fin; t += 3) {
        for (const [a, b] of [
          [indices[t], indices[t + 1]],
          [indices[t + 1], indices[t + 2]],
          [indices[t + 2], indices[t]],
        ]) {
          usos.set(clave(a, b), (usos.get(clave(a, b)) ?? 0) + 1)
        }
      }
      let mal = 0
      for (const [k, veces] of usos) {
        const a = Math.floor(k / p.vertices)
        const b = k % p.vertices
        if (veces !== 1 || usos.get(clave(b, a)) !== 1) mal++
      }
      expect(mal).toBe(0)
    }
    const caja = (desde: number, hasta: number) => {
      const lo = [Infinity, Infinity, Infinity]
      const hi = [-Infinity, -Infinity, -Infinity]
      for (let k = desde; k < hasta; k++) {
        for (let e = 0; e < 3; e++) {
          lo[e] = Math.min(lo[e], posiciones[k * 3 + e])
          hi[e] = Math.max(hi[e], posiciones[k * 3 + e])
        }
      }
      return { lo, hi }
    }
    const deFuera = caja(0, p.canal!.vertice)
    const delCanal = caja(p.canal!.vertice, p.vertices)
    for (let e = 0; e < 3; e++) {
      expect(delCanal.lo[e]).toBeGreaterThan(deFuera.lo[e])
      expect(delCanal.hi[e]).toBeLessThan(deFuera.hi[e])
    }
  })

  it.each(LARGOS)('%s: su eje es el de antes, y los cortes del taller caen donde caían', (id) => {
    // Medido al rehacerlos (D-335): el centro se movió como mucho 1,4 mm, la dirección 0,3° y los extremos 2,2 mm; el
    // plano de los tres cortes de abajo, 1,6 mm y 0,3°. Se deja algo de margen.
    const { posiciones, indices } = leer(pieza(id))
    const ahora = ejeDelHueso(posiciones, indices)!
    const antes = EJE_DE_ANTES[id]
    const grados = (a: readonly number[], b: readonly number[]) =>
      (Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI
    const mm = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000
    expect(mm(ahora.centro, antes.centro)).toBeLessThan(2)
    expect(grados(ahora.direccion, antes.direccion)).toBeLessThan(0.5)
    expect(Math.abs(ahora.proximal - antes.proximal) * 1000).toBeLessThan(3)
    expect(Math.abs(ahora.distal - antes.distal) * 1000).toBeLessThan(3)
    for (const corte of [
      { posicion: 50, inclinacion: 0, giro: 0 },
      { posicion: 30, inclinacion: 60, giro: 180 },
      { posicion: 70, inclinacion: 45, giro: 90 },
    ]) {
      // Las caras del giro del eje de ahora valen para el de antes: con 0,3° de diferencia, la cara se mueve menos.
      const deAntes = planoDelCorte({ ...ahora, ...antes }, corte)
      const deAhora = planoDelCorte(ahora, corte)
      expect(mm(deAntes.punto, deAhora.punto)).toBeLessThan(2.5)
      expect(grados(deAntes.normal, deAhora.normal)).toBeLessThan(0.5)
    }
  })

  it('la tibia partida a media diáfisis deja un anillo de cortical en cada trozo, con el canal dentro', () => {
    const tibia = leer(pieza('FJ3387'))
    const plano = planoDelCorte(ejeDelHueso(tibia.posiciones, tibia.indices)!, { posicion: 50, inclinacion: 0, giro: 0 })
    const r = partirMalla(tibia, plano)
    expect(r.lazos).toEqual({ tapados: 2, abiertos: 0 })
    for (const trozo of [r.haciaLaNormal, r.contraLaNormal]) {
      const normales = Float32Array.from(trozo.normales, (x) => x / 32767)
      const tapas = tapasDeCorte(trozo.posiciones, normales, trozo.indices)
      expect(tapas).toHaveLength(1)
      expect(tapas[0].agujeros).toBe(1)
      const marca = triangulosDelCanal(trozo.posiciones, trozo.indices, { excluir: verticesDeLasTapas(trozo.posiciones, normales) })
      // La mitad del canal, o así: es de lo que quedó en cada trozo.
      const delCanal = (pieza('FJ3387').indices - pieza('FJ3387').canal!.indice) / 3
      expect(suma(marca)).toBeGreaterThan(delCanal * 0.3)
      expect(suma(marca)).toBeLessThan(delCanal * 0.8)
    }
  })

  it('el istmo de la tibia y del fémur deja empezar a fresar con la cabeza más chica, y el de la tibia es el de un adulto', () => {
    const istmo = (id: string) => pieza(id).istmoMm!
    for (const id of ['FJ3282', 'FJ3387', 'FJ3259', 'FJ3365']) {
      expect(istmo(id)).toBeGreaterThanOrEqual(CABEZAS_DE_FRESA_MM[0] + 1)
      expect(juzgarElFresado([CABEZAS_DE_FRESA_MM[0]], null, istmo(id)).aviso).toBeNull()
    }
    // 9 a 12 mm es lo que mide el istmo de una tibia de adulto; el de partida del simulador son 11.
    expect(istmo('FJ3387')).toBeGreaterThan(9)
    expect(istmo('FJ3387')).toBeLessThan(12)
  })
})
