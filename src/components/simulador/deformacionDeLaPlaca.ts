import * as THREE from 'three'
import { crearMapaDelContorno, type ContornoDeLaPlaca } from '@/lib/contornoDeLaPlaca'

/**
 * Deformar la malla de una placa con un contorno (P-005 E1). Lo comparten la mesa de modelado (`mesaDeModelado.ts`) y la placa que se apoya en el
 * hueso (`implantesEnLaEscena.ts`): la misma función en los dos sitios, para que lo que se ve en la mesa sea lo que luego se apoya.
 *
 * El contorno trabaja en milímetros con `u` = ancho, `v` = grosor y `s` = largo, con el centro de la caja como origen; el modelo de la placa
 * tiene el ancho en X, el grosor en +Y y el largo en −Z, en metros (el marco de Blender pasado a glTF). Aquí se pasa de un marco al otro.
 */

export interface OriginalDeMalla {
  malla: THREE.Mesh
  /** Las posiciones de los vértices antes de deformar: cada cambio de contorno parte de ellas, no de lo ya deformado. */
  posiciones: Float32Array
  /** De la malla al marco local del grupo, y de vuelta. */
  aGrupo: THREE.Matrix4
  deGrupo: THREE.Matrix4
}

/** Guarda las posiciones originales de todas las mallas del grupo, con las matrices para ir y volver de su marco local. */
export function guardarOriginales(grupo: THREE.Object3D): OriginalDeMalla[] {
  grupo.updateMatrixWorld(true)
  const inversa = grupo.matrixWorld.clone().invert()
  const originales: OriginalDeMalla[] = []
  grupo.traverse((o) => {
    const malla = o as THREE.Mesh
    if (!malla.isMesh) return
    const posiciones = malla.geometry.attributes.position
    if (!posiciones) return
    const aGrupo = inversa.clone().multiply(malla.matrixWorld)
    originales.push({ malla, posiciones: Float32Array.from(posiciones.array as ArrayLike<number>), aGrupo, deGrupo: aGrupo.clone().invert() })
  })
  return originales
}

/** Un punto del marco local del grupo (metros) al marco del contorno (u, v, s en mm). */
export function aMarcoDelContorno(g: THREE.Vector3, centro: THREE.Vector3): [number, number, number] {
  return [(g.x - centro.x) * 1000, (g.y - centro.y) * 1000, -(g.z - centro.z) * 1000]
}

/** Del marco del contorno al marco local del grupo. */
export function deMarcoDelContorno(p: [number, number, number], centro: THREE.Vector3, salida: THREE.Vector3): THREE.Vector3 {
  return salida.set(centro.x + p[0] / 1000, centro.y + p[1] / 1000, centro.z - p[2] / 1000)
}

/**
 * La transformación del contorno aplicada a un punto del marco local del grupo (metros): lo que se usa para saber dónde quedan los agujeros de
 * la placa ya doblada. Sin dobleces, devuelve una copia del mismo punto.
 */
export function mapaEnElMarcoDelGrupo(contorno: ContornoDeLaPlaca, centro: THREE.Vector3, mitadMm: number): (local: THREE.Vector3) => THREE.Vector3 {
  if (contorno.dobleces.length === 0) return (local) => local.clone()
  const mapa = crearMapaDelContorno(contorno, mitadMm + 5)
  return (local) => deMarcoDelContorno(mapa(...aMarcoDelContorno(local, centro)), centro, new THREE.Vector3())
}

/** Deforma las mallas con el contorno, partiendo siempre de las posiciones originales. */
export function deformarLasMallas(originales: readonly OriginalDeMalla[], centro: THREE.Vector3, contorno: ContornoDeLaPlaca, mitadMm: number) {
  const mapa = crearMapaDelContorno(contorno, mitadMm + 5)
  const v = new THREE.Vector3()
  const salida = new THREE.Vector3()
  for (const { malla, posiciones, aGrupo, deGrupo } of originales) {
    const atributo = malla.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < atributo.count; i++) {
      v.set(posiciones[i * 3], posiciones[i * 3 + 1], posiciones[i * 3 + 2]).applyMatrix4(aGrupo)
      deMarcoDelContorno(mapa(...aMarcoDelContorno(v, centro)), centro, salida).applyMatrix4(deGrupo)
      atributo.setXYZ(i, salida.x, salida.y, salida.z)
    }
    atributo.needsUpdate = true
    malla.geometry.computeVertexNormals()
    malla.geometry.computeBoundingBox()
    malla.geometry.computeBoundingSphere()
  }
}
