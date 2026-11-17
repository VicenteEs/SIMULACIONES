import * as THREE from 'three'
import type { Punto } from '@/lib/incisiones'
import { cadenaDeLaMalla } from './heridas'

/**
 * El trazo llevado a la piel en reposo antes de cortar (D-416).
 *
 * El trazo se pincha donde se ve: cada punto es un rayo de la cámara contra la malla tal como está ahora, abierta por su
 * herida, apartada por los Farabeuf, estirada o fruncida. Pero `cortarCapa` corta la malla **cerrada**, vuelta a la base de
 * su último corte, y tomaba esos puntos como si fueran de ella. Donde nada se había movido daba igual. Junto a una herida
 * abierta, no: el labio está a 17 mm de la línea y la piel de detrás, fruncida; el corte caía en el tejido que en reposo
 * estaba en esas coordenadas, que no es el que se veía, y al volver a abrirse la herida aparecía corrido y torcido. Es la
 * barra de la T de D-415 cruzada con los Farabeuf ya puestos: la mitad de abajo, la que pasa junto al Farabeuf, salía
 * retorcida.
 *
 * Ahora cada punto del trazo que cae sobre una parte movida de la malla va al mismo sitio del mismo triángulo en reposo
 * (las mismas coordenadas baricéntricas). Es el tejido que se tenía debajo al pinchar, y la herida se abre donde se trazó.
 */

/** Una malla cortada con sus vértices dos veces: donde están ahora y donde los dejó su último corte, cerrados. */
export interface MallaConReposo {
  /** Las posiciones de ahora, en el espacio de la malla. */
  ahora: ArrayLike<number>
  /** Las de reposo, en el mismo orden: `corte.posiciones` de su último corte. */
  reposo: ArrayLike<number>
  indices: ArrayLike<number>
  /** Del espacio de la malla al mundo. */
  aMundo: THREE.Matrix4
}

/**
 * La malla con su reposo, si tiene herida: la base de su último corte, que es lo que `cortarCapa` vuelve a poner antes de
 * cortarla otra vez. Sin herida no hace falta: se corta tal como está.
 */
export function conSuReposo(malla: THREE.Mesh): MallaConReposo | null {
  const cadena = cadenaDeLaMalla(malla)
  const ultima = cadena[cadena.length - 1]
  const geometria = malla.geometry as THREE.BufferGeometry
  const posicion = geometria.getAttribute('position') as THREE.BufferAttribute | undefined
  const indice = geometria.getIndex()
  if (!ultima || !indice || !posicion?.isBufferAttribute) return null
  if (ultima.corte.posiciones.length !== posicion.count * 3) return null
  malla.updateWorldMatrix(true, false)
  return { ahora: posicion.array, reposo: ultima.corte.posiciones, indices: indice.array, aMundo: malla.matrixWorld.clone() }
}

/** Un punto llevado al reposo, con la normal de la piel ahí. */
export interface PuntoEnReposo {
  punto: Punto
  normal: Punto
}

/**
 * Dónde estaba en reposo el tejido que hay ahora en cada punto, o `null` si el punto no cae sobre nada movido: entonces el
 * reposo es él mismo. Cae sobre algo si está a no más de `tolerancia` de un triángulo de alguna malla con un vértice
 * corrido más de `movido` (las dos en unidades del mundo). La normal es la del triángulo en reposo, hacia el lado de la que
 * se dé.
 */
export function llevarAlReposo(
  puntos: readonly Punto[],
  normales: readonly Punto[],
  mallas: readonly MallaConReposo[],
  tolerancia: number,
  movido: number,
): (PuntoEnReposo | null)[] {
  const mejores: ({ malla: MallaConReposo; triangulo: number; cerca: THREE.Vector3; distancia: number } | null)[] = puntos.map(() => null)
  const triangulo = new THREE.Triangle()
  const cerca = new THREE.Vector3()
  const local = new THREE.Vector3()
  for (const malla of mallas) {
    const escala = malla.aMundo.getMaxScaleOnAxis() || 1
    const aLocal = malla.aMundo.clone().invert()
    const tol = tolerancia / escala
    const mov2 = (movido / escala) ** 2
    const { ahora, reposo, indices } = malla
    const nVertices = Math.min(ahora.length, reposo.length) / 3
    const seMovio = new Uint8Array(nVertices)
    for (let v = 0; v < nVertices; v++) {
      const dx = ahora[3 * v] - reposo[3 * v]
      const dy = ahora[3 * v + 1] - reposo[3 * v + 1]
      const dz = ahora[3 * v + 2] - reposo[3 * v + 2]
      seMovio[v] = dx * dx + dy * dy + dz * dz > mov2 ? 1 : 0
    }
    // Solo los triángulos que algo movió, con su caja: lo quieto está en reposo y no hace falta llevarlo a ninguna parte.
    const movidos: number[] = []
    const cajas: number[] = []
    for (let t = 0; 3 * t + 2 < indices.length; t++) {
      const a = indices[3 * t]
      const b = indices[3 * t + 1]
      const c = indices[3 * t + 2]
      if (a >= nVertices || b >= nVertices || c >= nVertices) continue
      if (!seMovio[a] && !seMovio[b] && !seMovio[c]) continue
      movidos.push(t)
      for (let k = 0; k < 3; k++) {
        cajas.push(Math.min(ahora[3 * a + k], ahora[3 * b + k], ahora[3 * c + k]) - tol)
        cajas.push(Math.max(ahora[3 * a + k], ahora[3 * b + k], ahora[3 * c + k]) + tol)
      }
    }
    if (movidos.length === 0) continue
    puntos.forEach((p, i) => {
      local.set(p[0], p[1], p[2]).applyMatrix4(aLocal)
      for (let j = 0; j < movidos.length; j++) {
        const caja = 6 * j
        if (local.x < cajas[caja] || local.x > cajas[caja + 1]) continue
        if (local.y < cajas[caja + 2] || local.y > cajas[caja + 3]) continue
        if (local.z < cajas[caja + 4] || local.z > cajas[caja + 5]) continue
        const t = movidos[j]
        leerTriangulo(triangulo, ahora, indices, t)
        triangulo.closestPointToPoint(local, cerca)
        const distancia = cerca.distanceTo(local) * escala
        const antes = mejores[i]
        if (distancia <= tolerancia && (!antes || distancia < antes.distancia)) {
          mejores[i] = { malla, triangulo: t, cerca: cerca.clone(), distancia }
        }
      }
    })
  }

  const baricentro = new THREE.Vector3()
  const enReposo = new THREE.Triangle()
  const normal = new THREE.Vector3()
  return mejores.map((m, i) => {
    if (!m) return null
    leerTriangulo(triangulo, m.malla.ahora, m.malla.indices, m.triangulo)
    // Un triángulo aplastado en una línea no tiene baricéntricas: el punto se queda donde está.
    if (!THREE.Triangle.getBarycoord(m.cerca, triangulo.a, triangulo.b, triangulo.c, baricentro)) return null
    leerTriangulo(enReposo, m.malla.reposo, m.malla.indices, m.triangulo)
    const punto = new THREE.Vector3()
      .addScaledVector(enReposo.a, baricentro.x)
      .addScaledVector(enReposo.b, baricentro.y)
      .addScaledVector(enReposo.c, baricentro.z)
      .applyMatrix4(m.malla.aMundo)
    enReposo.getNormal(normal).transformDirection(m.malla.aMundo)
    const dada = normales[i]
    if (dada && normal.x * dada[0] + normal.y * dada[1] + normal.z * dada[2] < 0) normal.negate()
    return { punto: [punto.x, punto.y, punto.z] as const, normal: [normal.x, normal.y, normal.z] as const }
  })
}

function leerTriangulo(destino: THREE.Triangle, posiciones: ArrayLike<number>, indices: ArrayLike<number>, t: number) {
  const [a, b, c] = [indices[3 * t], indices[3 * t + 1], indices[3 * t + 2]]
  destino.a.set(posiciones[3 * a], posiciones[3 * a + 1], posiciones[3 * a + 2])
  destino.b.set(posiciones[3 * b], posiciones[3 * b + 1], posiciones[3 * b + 2])
  destino.c.set(posiciones[3 * c], posiciones[3 * c + 1], posiciones[3 * c + 2])
}

/**
 * Lleva al reposo lo que sale del trazo pinchado: un punto que cae sobre el trazo, en el tramo entre dos de sus muestras, va
 * al mismo sitio entre esas dos muestras en reposo. Uno que no está en el trazo, se queda: lo tomado de una incisión de
 * antes, que ya se guardó en reposo, o el sitio donde nace una rama (D-415), que se puso en su línea.
 *
 * Por eso se lleva el trazo y no cada punto suelto. La incisión de antes que se alarga está guardada en reposo, y buscada
 * en la malla de ahora caería, si algo la movió, sobre otro tejido: se la llevaría a un sitio que no es el suyo.
 */
export function porElTrazo(
  trazo: readonly Punto[],
  enReposo: readonly (PuntoEnReposo | null)[],
  normales: readonly Punto[],
  tolerancia: number,
): (p: Punto, n: Punto) => { p: Punto; n: Punto } {
  const reposo = trazo.map((p, i) => enReposo[i]?.punto ?? p)
  const normalDe = (i: number) => enReposo[i]?.normal ?? normales[i] ?? ([0, 0, 1] as const)
  return (p, n) => {
    let mejor: { i: number; f: number; d: number } | null = null
    for (let i = 0; i + 1 < trazo.length; i++) {
      const a = trazo[i]
      const b = trazo[i + 1]
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
      const f = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2)) : 0
      const d = Math.hypot(a[0] + ab[0] * f - p[0], a[1] + ab[1] * f - p[1], a[2] + ab[2] * f - p[2])
      if (!mejor || d < mejor.d) mejor = { i, f, d }
    }
    if (!mejor || mejor.d > tolerancia) return { p, n }
    const { i, f } = mejor
    const ra = reposo[i]
    const rb = reposo[i + 1]
    const na = normalDe(i)
    const nb = normalDe(i + 1)
    const mezcla = (x: Punto, y: Punto): Punto => [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f]
    const nm = mezcla(na, nb)
    const largo = Math.hypot(nm[0], nm[1], nm[2]) || 1
    return { p: mezcla(ra, rb), n: [nm[0] / largo, nm[1] / largo, nm[2] / largo] }
  }
}
