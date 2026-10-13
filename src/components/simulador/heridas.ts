import * as THREE from 'three'
import { abrirHerida, afilado, cortarMalla, type MallaCortada, type Vec3 } from '@/lib/corteDeMalla'

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
  /**
   * La cinta roja que mantiene a la vista una incisión recién hecha.
   *
   * Un corte limpio deja los dos labios pegados (apertura 0): la malla queda
   * partida pero no se ve, y lo único que se distinguía era el trazo rojo de
   * guía, que desaparece en cuanto se empieza otro. A quien hacía la incisión
   * con el bisturí de piel y pasaba al bisturí profundo le parecía que la
   * primera se había borrado. La cinta es el surco de la incisión: dos o tres
   * milímetros de rojo oscuro siguiendo el corte, que se aparta solo cuando la
   * herida abre más que eso y deja ver el plano de debajo.
   */
  cinta: THREE.Mesh
  /** Cuánto está abierto cada labio, en unidades del mundo (el máximo, si hay perfil). */
  mas: number
  menos: number
  /**
   * Cuánto abre cada labio en cada punto de la herida, en unidades del mundo, si
   * la apertura no es pareja (separadores colocados en un punto). Sin perfil, la
   * herida abre por igual a todo lo largo (`mas`, `menos`).
   */
  perfil?: (t: number) => { mas: number; menos: number }
  /** Unidades del mundo que mide un milímetro: lo necesita la cinta para su ancho. */
  unidadesPorMm: number
  /** El largo de la incisión, en unidades del mundo. */
  largo: number
}

export interface ParametrosDeCorte {
  /** Cuánto penetra el corte hacia dentro de la malla, en unidades del mundo. */
  profundidad: number
  /** Cuánto tejido se arrastra al abrir, en unidades del mundo. */
  alcance: number
  /** Unidades del mundo por milímetro, para el ancho de la cinta. Sin él se supone 0,001 (metros). */
  unidadesPorMm?: number
}

/** Ancho mínimo de la cinta de la incisión, en milímetros (la mitad a cada lado). */
export const ANCHO_VISIBLE_DE_LA_INCISION_MM = 2.4
/** Con la herida más abierta que esto la cinta se aparta: se ve el plano de debajo. */
export const APERTURA_QUE_APARTA_LA_CINTA_MM = 5

/**
 * Un valor de un atributo tal como está guardado, sin normalizar.
 *
 * `getComponent` de three devuelve lo normalizado (0 a 1) para los atributos
 * enteros que lo piden —los colores de vértice en bytes—, y al guardarlo de vuelta
 * en el mismo arreglo de bytes se truncaba a cero: la piel perdía su color justo
 * donde se cortaba. Se lee el arreglo tal cual.
 */
function valorCrudo(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, k: number): number {
  if ((a as THREE.BufferAttribute).isBufferAttribute) {
    return (a.array as unknown as ArrayLike<number>)[i * a.itemSize + k]
  }
  const intercalado = a as THREE.InterleavedBufferAttribute
  return (intercalado.data.array as unknown as ArrayLike<number>)[i * intercalado.data.stride + intercalado.offset + k]
}

/** Los atributos que no son posición ni normal se copian vértice a vértice por el mapa de origen. */
function copiarAtributo(origen: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, mapa: Uint32Array) {
  const tam = origen.itemSize
  // Del mismo tipo que el original (colores en bytes, uv en flotantes…): copiar a
  // un Float32Array aceptaría el dato pero cambiaría cómo la tarjeta lo lee.
  const fuente = (origen as THREE.BufferAttribute).isBufferAttribute
    ? (origen as THREE.BufferAttribute).array
    : (origen as THREE.InterleavedBufferAttribute).data.array
  const Tipo = fuente.constructor as new (n: number) => Float32Array
  const nuevo = new Tipo(mapa.length * tam)
  for (let i = 0; i < mapa.length; i++) {
    for (let k = 0; k < tam; k++) {
      nuevo[i * tam + k] = valorCrudo(origen, mapa[i], k)
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

  // La cinta del surco: dos vértices por cada nodo del trazo (ver `actualizarCinta`).
  const pares = corte.curva.tramos.length + 1
  const cintaGeometria = new THREE.BufferGeometry()
  cintaGeometria.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pares * 2 * 3), 3))
  const indicesDeLaCinta: number[] = []
  for (let i = 0; i < pares - 1; i++) {
    const a = 2 * i
    indicesDeLaCinta.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  cintaGeometria.setIndex(indicesDeLaCinta)
  const cinta = new THREE.Mesh(
    cintaGeometria,
    new THREE.MeshBasicMaterial({
      color: 0x6e1318,
      side: THREE.DoubleSide,
      depthWrite: false,
      // Un pelo por delante de la piel: pegada a ella parpadearía (z-fighting).
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  )
  cinta.name = 'cinta-de-la-herida'
  cinta.raycast = () => {}
  cinta.renderOrder = 1
  cinta.frustumCulled = false

  malla.geometry = nueva
  malla.add(cinta)
  malla.add(bordes)

  let largo = 0
  for (let i = 1; i < puntos.length; i++) largo += puntos[i].distanceTo(puntos[i - 1])

  const herida: HeridaEnCapa = {
    malla,
    original,
    corte,
    escala,
    bordes,
    cinta,
    mas: 0,
    menos: 0,
    largo,
    unidadesPorMm: parametros.unidadesPorMm ?? 0.001,
  }
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
  actualizarCinta(h)
}

/**
 * Tiende la cinta a lo largo del trazo, con un ancho mínimo.
 *
 * Con la herida cerrada los labios coinciden y la cinta mide el ancho mínimo,
 * centrada en el corte: es la incisión recién hecha. Al abrirse, la cinta sigue la
 * apertura de cada punto (la del separador que haya cerca, si hay perfil) hasta que
 * pasa de `APERTURA_QUE_APARTA_LA_CINTA_MM`, y entonces desaparece para dejar ver el
 * plano de debajo.
 *
 * Se tiende por los **nodos del trazo** y no por los vértices de los labios. Los
 * nodos son los puntos que se pincharon sobre la piel, con su normal, y están en la
 * superficie y a pocos milímetros unos de otros. Los vértices de los labios caen
 * donde el trazo cruza una arista, y en una malla de triángulos largos —la espinilla
 * de la pierna del atlas— quedan a decenas de milímetros: la recta que une dos de
 * ellos pasa por dentro de la pierna y la cinta se veía a trozos, como una línea de
 * puntos, por mucho que se la subiera sobre la piel. Era la «incisión que se
 * borraba» a medias.
 */
function actualizarCinta(h: HeridaEnCapa) {
  const curva = h.corte.curva
  const nodos = curva.tramos.length + 1
  if (nodos < 2) {
    h.cinta.visible = false
    return
  }
  const destino = h.cinta.geometry.getAttribute('position') as THREE.BufferAttribute
  // Medio ancho mínimo, en unidades locales de la malla (que pueden estar escaladas).
  const medioAncho = (ANCHO_VISIBLE_DE_LA_INCISION_MM / 2) * (h.unidadesPorMm / h.escala)
  // Un milímetro por encima de la piel, a lo largo de la normal: la cinta es una recta entre nodos y, aunque
  // estén cerca, en una piel curva no debe quedar enterrada.
  const levantar = 1 * (h.unidadesPorMm / h.escala)
  let abertura = 0
  for (let k = 0; k < nodos; k++) {
    const ultimo = k === nodos - 1
    const tramo = curva.tramos[ultimo ? k - 1 : k]
    const a = ultimo
      ? [tramo.a[0] + tramo.d[0] * tramo.largo, tramo.a[1] + tramo.d[1] * tramo.largo, tramo.a[2] + tramo.d[2] * tramo.largo]
      : tramo.a
    const t = ultimo || curva.largoTotal <= 0 ? 1 : tramo.desde / curva.largoTotal
    const abre = h.perfil ? h.perfil(t) : { mas: h.mas, menos: h.menos }
    // Cuánto se separa cada labio en este punto, con el mismo estrechamiento hacia las puntas que la malla.
    const peso = afilado(t)
    const mas = (abre.mas / h.escala) * peso
    const menos = (abre.menos / h.escala) * peso
    // El lateral es el mismo que mueve a los labios: el «más» va hacia `+lateral` y el «menos» hacia `-lateral`.
    const centro = (mas - menos) / 2
    const mitad = Math.max(medioAncho, (mas + menos) / 2)
    abertura = Math.max(abertura, mas + menos)
    const nm = curva.normales[k]
    const lt = curva.laterales[k]
    const bx = a[0] + nm[0] * levantar + lt[0] * centro
    const by = a[1] + nm[1] * levantar + lt[1] * centro
    const bz = a[2] + nm[2] * levantar + lt[2] * centro
    destino.setXYZ(2 * k, bx + lt[0] * mitad, by + lt[1] * mitad, bz + lt[2] * mitad)
    destino.setXYZ(2 * k + 1, bx - lt[0] * mitad, by - lt[1] * mitad, bz - lt[2] * mitad)
  }
  destino.needsUpdate = true
  h.cinta.geometry.computeBoundingSphere()
  h.cinta.visible = (abertura * h.escala) / h.unidadesPorMm <= APERTURA_QUE_APARTA_LA_CINTA_MM
}

/** Separa los labios: `mas` y `menos` en unidades del mundo. */
export function abrirCapa(
  h: HeridaEnCapa,
  mas: number,
  menos: number,
  /** Apertura según la posición a lo largo de la herida, en unidades del mundo. `mas` y `menos` son sus máximos. */
  perfil?: (t: number) => { mas: number; menos: number },
) {
  h.mas = mas
  h.menos = menos
  h.perfil = perfil
  const posiciones = abrirHerida(
    h.corte,
    mas / h.escala,
    menos / h.escala,
    perfil
      ? (t) => {
          const o = perfil(t)
          return { mas: o.mas / h.escala, menos: o.menos / h.escala }
        }
      : undefined,
  )
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
  h.cinta.removeFromParent()
  h.cinta.geometry.dispose()
  ;(h.cinta.material as THREE.Material).dispose()
}

/**
 * Dónde cae un punto del mundo respecto de la herida: de qué labio es y hacia
 * dónde se separa. Sirve para que un separador agarre el labio que se pincha.
 *
 * El vértice de labio más cercano da la dirección y la distancia; **el lado lo
 * dice a qué lado de ese vértice cae el punto**. Con la herida cerrada los dos
 * labios ocupan el mismo sitio y el más cercano era siempre el primero que se
 * miraba: un Farabeuf agarraba siempre el mismo borde, pincharan donde pincharan.
 */
export function ladoDeLaHerida(
  h: HeridaEnCapa,
  puntoDelMundo: THREE.Vector3,
): { lado: 1 | -1; direccion: THREE.Vector3; cerca: number; t: number } | null {
  const local = puntoDelMundo.clone().applyMatrix4(h.malla.matrixWorld.clone().invert())
  let mejor = Infinity
  let vertice: THREE.Vector3 | null = null
  let direccion: THREE.Vector3 | null = null
  let t = 0.5
  const posiciones = h.malla.geometry.getAttribute('position') as THREE.BufferAttribute
  for (const cadena of [h.corte.labios.mas, h.corte.labios.menos]) {
    for (const v of cadena) {
      const p = new THREE.Vector3(posiciones.getX(v), posiciones.getY(v), posiciones.getZ(v))
      const d = local.distanceTo(p)
      if (d < mejor) {
        mejor = d
        vertice = p
        t = h.corte.largoT[v]
        direccion = new THREE.Vector3(h.corte.direccion[3 * v], h.corte.direccion[3 * v + 1], h.corte.direccion[3 * v + 2])
      }
    }
  }
  if (!vertice || !direccion) return null
  const lado: 1 | -1 = local.clone().sub(vertice).dot(direccion) >= 0 ? 1 : -1
  // La dirección se lleva al mundo, sin la traslación.
  const enElMundo = direccion.transformDirection(h.malla.matrixWorld)
  return { lado, direccion: enElMundo, cerca: mejor * h.escala, t }
}
