import * as THREE from 'three'
import { abrirHerida, cortarMalla, type MallaCortada, type Vec3 } from '@/lib/corteDeMalla'

/**
 * La herida de una capa de partes blandas dentro de la escena (D-167).
 *
 * `corteDeMalla.ts` trabaja con arreglos y no sabe de three; esto es el pegamento:
 * pasa la incisión al espacio de la malla, la corta, sustituye su geometría por
 * la cortada y la mueve cuando se abre. Se guarda la geometría original para
 * poder cerrar la herida (deshacer el corte) sin recargar el modelo.
 */

export interface HeridaEnCapa {
  malla: THREE.Mesh
  /** La geometría de antes del corte. Se devuelve a la malla al cerrar. */
  original: THREE.BufferGeometry
  corte: MallaCortada
  /** Cuánto mide una unidad local en el mundo: las distancias del mundo se dividen por esto. */
  escala: number
  /** El borde rojo de la herida, hijo de la malla. */
  bordes: THREE.LineSegments
  /** Cuánto está abierto cada labio, en unidades del mundo. */
  mas: number
  menos: number
  /** El largo de la incisión, en unidades del mundo. */
  largo: number
}

export interface ParametrosDeCorte {
  /** Cuánto penetra el corte hacia dentro de la malla, en unidades del mundo. */
  profundidad: number
  /** Cuánto tejido se arrastra al abrir, en unidades del mundo. */
  alcance: number
}

/** Los atributos que no son posición ni normal se copian vértice a vértice por el mapa de origen. */
function copiarAtributo(origen: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, mapa: Uint32Array) {
  const tam = origen.itemSize
  // Del mismo tipo que el original (colores en bytes, uv en flotantes…): copiar a
  // un Float32Array aceptaría el dato pero cambiaría cómo la tarjeta lo lee.
  const Tipo = origen.array.constructor as new (n: number) => Float32Array
  const nuevo = new Tipo(mapa.length * tam)
  for (let i = 0; i < mapa.length; i++) {
    for (let k = 0; k < tam; k++) {
      nuevo[i * tam + k] = origen.getComponent(mapa[i], k)
    }
  }
  return new THREE.BufferAttribute(nuevo, tam, origen.normalized)
}

/**
 * Corta una malla con la incisión (puntos y normales en el mundo). Devuelve
 * `null` si no cabe cortarla: no toca la malla, o tiene varios materiales por
 * grupos y reordenar sus triángulos los desordenaría.
 */
export function cortarCapa(
  malla: THREE.Mesh,
  puntos: THREE.Vector3[],
  normales: THREE.Vector3[],
  parametros: ParametrosDeCorte,
): HeridaEnCapa | null {
  const original = malla.geometry as THREE.BufferGeometry
  if (original.groups.length > 1) return null
  const posicion = original.getAttribute('position')
  if (!posicion) return null

  malla.updateWorldMatrix(true, false)
  const aLocal = malla.matrixWorld.clone().invert()
  const escala = malla.matrixWorld.getMaxScaleOnAxis() || 1
  const aLocalVec = (v: THREE.Vector3): Vec3 => {
    const p = v.clone().applyMatrix4(aLocal)
    return [p.x, p.y, p.z]
  }
  const aLocalDir = (v: THREE.Vector3): Vec3 => {
    const d = v.clone().transformDirection(aLocal)
    return [d.x, d.y, d.z]
  }

  const posiciones = new Float32Array(posicion.count * 3)
  for (let i = 0; i < posicion.count; i++) {
    posiciones[3 * i] = posicion.getX(i)
    posiciones[3 * i + 1] = posicion.getY(i)
    posiciones[3 * i + 2] = posicion.getZ(i)
  }
  const indice = original.getIndex()
  const indices = indice
    ? Uint32Array.from(indice.array as ArrayLike<number>)
    : Uint32Array.from({ length: posicion.count }, (_, i) => i)

  const alcanceLocal = parametros.alcance / escala
  const corte = cortarMalla(
    { posiciones, indices },
    { puntos: puntos.map(aLocalVec), normales: normales.map(aLocalDir) },
    {
      profundidad: parametros.profundidad / escala,
      alcance: alcanceLocal,
      // Más que la arista más larga que pueda cruzarse: el corte mira solo la
      // franja que rodea a la incisión.
      holgura: alcanceLocal,
    },
  )
  if (!corte) return null

  const nueva = new THREE.BufferGeometry()
  nueva.setAttribute('position', new THREE.BufferAttribute(corte.posiciones.slice(), 3))
  for (const nombre of Object.keys(original.attributes)) {
    if (nombre === 'position' || nombre === 'normal') continue
    nueva.setAttribute(nombre, copiarAtributo(original.attributes[nombre], corte.origen))
  }
  nueva.setIndex(new THREE.BufferAttribute(corte.indices, 1))
  nueva.computeVertexNormals()
  nueva.computeBoundingSphere()
  nueva.computeBoundingBox()

  // El borde de la herida: dos líneas, una por labio, que siguen a los vértices.
  const segmentos = Math.max(0, corte.labios.mas.length - 1)
  const bordesGeometria = new THREE.BufferGeometry()
  bordesGeometria.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segmentos * 4 * 3), 3))
  const bordes = new THREE.LineSegments(
    bordesGeometria,
    new THREE.LineBasicMaterial({ color: 0x8c1c1c, depthWrite: false }),
  )
  bordes.name = 'borde-de-la-herida'
  // El borde es decoración: no se pincha ni tapa lo que hay debajo.
  bordes.raycast = () => {}
  bordes.renderOrder = 2

  malla.geometry = nueva
  malla.add(bordes)

  let largo = 0
  for (let i = 1; i < puntos.length; i++) largo += puntos[i].distanceTo(puntos[i - 1])

  const herida: HeridaEnCapa = { malla, original, corte, escala, bordes, mas: 0, menos: 0, largo }
  actualizarBordes(herida)
  return herida
}

function actualizarBordes(h: HeridaEnCapa) {
  const posiciones = h.malla.geometry.getAttribute('position') as THREE.BufferAttribute
  const destino = h.bordes.geometry.getAttribute('position') as THREE.BufferAttribute
  let k = 0
  for (const cadena of [h.corte.labios.mas, h.corte.labios.menos]) {
    for (let i = 0; i < cadena.length - 1; i++) {
      for (const v of [cadena[i], cadena[i + 1]]) {
        destino.setXYZ(k++, posiciones.getX(v), posiciones.getY(v), posiciones.getZ(v))
      }
    }
  }
  destino.needsUpdate = true
  h.bordes.geometry.setDrawRange(0, k)
  h.bordes.geometry.computeBoundingSphere()
}

/** Separa los labios: `mas` y `menos` en unidades del mundo. */
export function abrirCapa(h: HeridaEnCapa, mas: number, menos: number) {
  h.mas = mas
  h.menos = menos
  const posiciones = abrirHerida(h.corte, mas / h.escala, menos / h.escala)
  const atributo = h.malla.geometry.getAttribute('position') as THREE.BufferAttribute
  ;(atributo.array as Float32Array).set(posiciones)
  atributo.needsUpdate = true
  h.malla.geometry.computeVertexNormals()
  h.malla.geometry.computeBoundingSphere()
  h.malla.geometry.computeBoundingBox()
  actualizarBordes(h)
}

/** Deshace el corte: la malla vuelve a su geometría de antes y se sueltan las nuevas. */
export function cerrarCapa(h: HeridaEnCapa) {
  const nueva = h.malla.geometry
  h.malla.geometry = h.original
  nueva.dispose()
  h.bordes.removeFromParent()
  h.bordes.geometry.dispose()
  ;(h.bordes.material as THREE.Material).dispose()
}

/**
 * Dónde cae un punto del mundo respecto de la herida: de qué labio es y hacia
 * dónde se separa. Sirve para que un separador agarre el labio que se pincha.
 */
export function ladoDeLaHerida(h: HeridaEnCapa, puntoDelMundo: THREE.Vector3): { lado: 1 | -1; direccion: THREE.Vector3; cerca: number } | null {
  const local = puntoDelMundo.clone().applyMatrix4(h.malla.matrixWorld.clone().invert())
  // El vértice del labio más cercano manda: dice el lado, la dirección y a qué distancia está.
  let mejor = Infinity
  let mejorLado: 1 | -1 = 1
  let direccion: THREE.Vector3 | null = null
  const posiciones = h.malla.geometry.getAttribute('position') as THREE.BufferAttribute
  for (const [cadena, lado] of [
    [h.corte.labios.mas, 1],
    [h.corte.labios.menos, -1],
  ] as const) {
    for (const v of cadena) {
      const d = local.distanceTo(new THREE.Vector3(posiciones.getX(v), posiciones.getY(v), posiciones.getZ(v)))
      if (d < mejor) {
        mejor = d
        mejorLado = lado
        direccion = new THREE.Vector3(h.corte.direccion[3 * v], h.corte.direccion[3 * v + 1], h.corte.direccion[3 * v + 2])
      }
    }
  }
  if (!direccion) return null
  // La dirección se lleva al mundo, sin la traslación.
  const enElMundo = direccion.transformDirection(h.malla.matrixWorld)
  return { lado: mejorLado, direccion: enElMundo, cerca: mejor * h.escala }
}
