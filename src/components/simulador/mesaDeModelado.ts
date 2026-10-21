import * as THREE from 'three'
import {
  crearMapaDelContorno,
  orificioBajoElDoblez,
  orificiosDeformados,
  sitiosFatigados,
  textoDelContorno,
  type ContornoDeLaPlaca,
} from '@/lib/contornoDeLaPlaca'
import { clonarConRecursos } from './implantesEnLaEscena'
import { aMarcoDelContorno, deMarcoDelContorno, deformarLasMallas, guardarOriginales, type OriginalDeMalla } from './deformacionDeLaPlaca'

/**
 * La mesa de modelado (P-005 E1): una placa **suelta en el lienzo**, fuera del hueso, que se dobla y se tuerce con el alicate y las grifas y se
 * mueve como se haría sobre la mesa de instrumentos.
 *
 * La placa del hueso (`implantesEnLaEscena.ts`) está apoyada y fija a su manera; esta no. Es una copia propia del modelo, con su geometría, que se
 * deforma de verdad: cada vértice pasa por el mapa del contorno (`src/lib/contornoDeLaPlaca.ts`, que es donde viven las reglas y las pruebas).
 * Las posiciones originales se guardan una vez y cada cambio de contorno parte de ellas: deformar sobre lo ya deformado acumularía el error.
 *
 * Marco: la placa del modelo tiene el ancho en X, el grosor en +Y y el largo en −Z (el marco de Blender pasado a glTF). El contorno trabaja en
 * milímetros con `u` = ancho, `v` = grosor y `s` = largo, con el centro de la caja como origen; aquí se pasa de un marco al otro.
 */

export interface MesaDeModelado {
  grupo: THREE.Group
  nombre: string
  /** El instrumento de la bandeja del que salió la placa: «Llevar al hueso» vuelve a cogerlo. */
  instrumentoId: string | null
  /** Los agujeros, en milímetros y en el marco de Blender: (ancho, largo). */
  agujerosMm: [number, number][]
  contorno: ContornoDeLaPlaca
  /** Lo que mide la placa hacia cada lado del centro, en mm. */
  mitadMm: number
  anchoMm: number
  /** El sitio donde se apuntó, en mm desde el centro; `null` si todavía no se apuntó. */
  sitioMm: number | null
  /** La raya que cruza la placa en el sitio apuntado. */
  marca: THREE.Line | null
  originales: OriginalDeMalla[]
  /** El centro de la caja en el marco local del grupo, en metros. */
  centro: THREE.Vector3
  yMinimo: number
  yMaximo: number
}

/** Lo que la consola necesita saber de la mesa para decir cómo va la placa. */
export interface EstadoDeLaMesa {
  nombre: string
  instrumentoId: string | null
  /** «2 dobleces · flexión total 25° · flecha 3,2 mm». */
  texto: string
  sitioMm: number | null
  /** Qué hay bajo el sitio apuntado: «entre los orificios 3 y 4» o «sobre el orificio 4 (lo deformaría)». */
  lugarDelSitio: string | null
  /** Los orificios (desde 1) que los dobleces ya deformaron. */
  orificiosDeformados: number[]
  /** Los sitios (mm desde el centro) donde la placa se fatigó. */
  fatigados: number[]
  dobleces: number
  /** Hay algo que deshacer. */
  conManiobras: boolean
}

/**
 * Pone una copia de la placa sobre la mesa, de cara a quien mira: con el largo hacia arriba de la pantalla y la cara de arriba hacia la cámara.
 * Devuelve `null` si el modelo no tiene forma que medir.
 */
export function crearMesa(p: {
  escena: THREE.Scene
  plantilla: THREE.Object3D
  nombre: string
  instrumentoId: string | null
  agujerosMm: [number, number][]
  /** Dónde se pone, en el mundo. */
  posicion: THREE.Vector3
  /** Hacia dónde mira la cara de arriba (hacia la cámara). */
  haciaLaCamara: THREE.Vector3
  /** Qué es «arriba» en la pantalla: hacia ahí va el largo de la placa. */
  arriba: THREE.Vector3
  contorno: ContornoDeLaPlaca
}): MesaDeModelado | null {
  const grupo = clonarConRecursos(p.plantilla)
  grupo.position.set(0, 0, 0)
  grupo.quaternion.identity()
  grupo.updateMatrixWorld(true)
  const caja = new THREE.Box3().setFromObject(grupo)
  if (caja.isEmpty()) {
    soltarMesaGrupo(grupo)
    return null
  }
  const escala = grupo.scale.y || 1
  // El centro de la caja, en el marco local del grupo (metros): lo local es el mundo entre la escala.
  const centro = caja.getCenter(new THREE.Vector3()).divideScalar(escala)
  const tamano = caja.getSize(new THREE.Vector3()).divideScalar(escala)

  const originales = guardarOriginales(grupo)

  // Con el largo hacia arriba de la pantalla (−Z local → arriba) y la cara de arriba (+Y local) hacia la cámara.
  const y = p.haciaLaCamara.clone().normalize()
  const z = p.arriba.clone().negate()
  z.addScaledVector(y, -z.dot(y))
  if (z.lengthSq() < 1e-9) z.set(Math.abs(y.x) < 0.9 ? 1 : 0, Math.abs(y.x) < 0.9 ? 0 : 1, 0).addScaledVector(y, 0)
  z.normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  grupo.quaternion.copy(q)
  // El centro de la caja sobre el punto pedido.
  grupo.position.copy(p.posicion).sub(centro.clone().multiplyScalar(escala).applyQuaternion(q))
  p.escena.add(grupo)
  grupo.updateMatrixWorld(true)

  const mesa: MesaDeModelado = {
    grupo,
    nombre: p.nombre,
    instrumentoId: p.instrumentoId,
    agujerosMm: p.agujerosMm,
    contorno: p.contorno,
    mitadMm: (tamano.z * 1000) / 2,
    anchoMm: tamano.x * 1000,
    sitioMm: null,
    marca: null,
    originales,
    centro,
    yMinimo: caja.min.y / escala,
    yMaximo: caja.max.y / escala,
  }
  aplicarElContorno(mesa)
  return mesa
}

/** Vuelve a deformar la malla de la mesa con su contorno actual y redibuja la raya del sitio. */
export function aplicarElContorno(mesa: MesaDeModelado) {
  deformarLasMallas(mesa.originales, mesa.centro, mesa.contorno, mesa.mitadMm)
  ponerLaMarca(mesa, mesa.sitioMm)
}

/** Los orificios de la placa, en mm desde el centro a lo largo (la coordenada `s` del contorno). */
export function orificiosSMm(mesa: Pick<MesaDeModelado, 'agujerosMm' | 'centro'>): number[] {
  // Los agujeros vienen en el marco de Blender (ancho, largo), y el largo de Blender es −Z del modelo; el contorno parte del centro de la caja.
  // z = −largo/1000, y s = −(z − zc)·1000 = largo + zc·1000.
  return mesa.agujerosMm.map(([, largo]) => largo + mesa.centro.z * 1000)
}

/** Dónde cae un punto del mundo sobre la placa, en mm a lo largo desde el centro. Con la placa doblada, el del eje que queda más cerca. */
export function sitioDeUnPunto(mesa: MesaDeModelado, puntoDelMundo: THREE.Vector3): number {
  mesa.grupo.updateMatrixWorld(true)
  const objetivo = aMarcoDelContorno(mesa.grupo.worldToLocal(puntoDelMundo.clone()), mesa.centro)
  const mapa = crearMapaDelContorno(mesa.contorno, mesa.mitadMm + 5)
  let mejor = 0
  let mejorDistancia = Infinity
  for (let s = -mesa.mitadMm; s <= mesa.mitadMm; s += 0.5) {
    const e = mapa(0, 0, s)
    const d = (e[0] - objetivo[0]) ** 2 + (e[1] - objetivo[1]) ** 2 + (e[2] - objetivo[2]) ** 2
    if (d < mejorDistancia) {
      mejorDistancia = d
      mejor = s
    }
  }
  return mejor
}

/** Dibuja (o quita, con `null`) la raya que cruza la placa en `sMm`: el sitio donde actuará la herramienta. */
export function ponerLaMarca(mesa: MesaDeModelado, sMm: number | null) {
  mesa.sitioMm = sMm
  if (mesa.marca) {
    mesa.marca.removeFromParent()
    mesa.marca.geometry.dispose()
    ;(mesa.marca.material as THREE.Material).dispose()
    mesa.marca = null
  }
  if (sMm === null) return
  const mapa = crearMapaDelContorno(mesa.contorno, mesa.mitadMm + 5)
  const mitadAncho = mesa.anchoMm / 2 + 2
  const arriba = ((mesa.yMaximo - mesa.yMinimo) * 1000) / 2 + 0.4
  const extremos = [-mitadAncho, mitadAncho].map((u) => {
    const [x, y, z] = mapa(u, arriba, sMm)
    return deMarcoDelContorno([x, y, z], mesa.centro, new THREE.Vector3())
  })
  const geometria = new THREE.BufferGeometry().setFromPoints(extremos)
  const material = new THREE.LineBasicMaterial({ color: 0xf5a073, depthTest: false, transparent: true })
  const linea = new THREE.Line(geometria, material)
  linea.renderOrder = 10
  linea.userData.deInterfaz = true
  mesa.grupo.add(linea)
  mesa.marca = linea
}

/** Qué hay bajo el sitio apuntado, dicho en palabras, y si doblar ahí deformaría un orificio. */
export function lugarDelSitio(mesa: MesaDeModelado, sMm: number | null, soloTorsion = false): string | null {
  if (sMm === null) return null
  const orificios = orificiosSMm(mesa)
  const bajo = orificioBajoElDoblez(orificios, sMm, soloTorsion)
  if (bajo !== null) return `sobre el orificio ${bajo + 1}: doblar ahí lo deforma`
  if (orificios.length === 0) return 'entre orificios'
  const antes = orificios.filter((o) => o < sMm).length
  if (antes === 0) return 'antes del primer orificio'
  if (antes === orificios.length) return 'después del último orificio'
  return `entre los orificios ${antes} y ${antes + 1}`
}

export function estadoDeLaMesa(mesa: MesaDeModelado): EstadoDeLaMesa {
  const orificios = orificiosSMm(mesa)
  return {
    nombre: mesa.nombre,
    instrumentoId: mesa.instrumentoId,
    texto: textoDelContorno(mesa.contorno, mesa.mitadMm),
    sitioMm: mesa.sitioMm,
    lugarDelSitio: lugarDelSitio(mesa, mesa.sitioMm),
    orificiosDeformados: orificiosDeformados(mesa.contorno, orificios).map((i) => i + 1),
    fatigados: sitiosFatigados(mesa.contorno),
    dobleces: mesa.contorno.dobleces.length,
    conManiobras: mesa.contorno.maniobras.length > 0,
  }
}

function soltarMesaGrupo(grupo: THREE.Object3D) {
  grupo.removeFromParent()
  grupo.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose()
  })
}

export function soltarLaMesa(mesa: MesaDeModelado) {
  mesa.marca?.geometry.dispose()
  ;(mesa.marca?.material as THREE.Material | undefined)?.dispose()
  soltarMesaGrupo(mesa.grupo)
}
