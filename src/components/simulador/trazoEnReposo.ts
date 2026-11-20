import * as THREE from 'three'
import type { Punto } from '@/lib/incisiones'
import { pielSinAbultar } from './abultamientoEnLaEscena'
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
 *
 * Lo de ahora es la piel **sin el bulto** (D-421): el trazo llega aquí ya bajado de él (`conSuBulto`), y la base del corte
 * tampoco lo lleva. Con el bulto dentro, un punto bajado no caía en ningún triángulo de ahora y se cortaba donde estaba.
 */
export function conSuReposo(malla: THREE.Mesh): MallaConReposo | null {
  const cadena = cadenaDeLaMalla(malla)
  const ultima = cadena[cadena.length - 1]
  const geometria = malla.geometry as THREE.BufferGeometry
  const posicion = geometria.getAttribute('position') as THREE.BufferAttribute | undefined
  const indice = geometria.getIndex()
  if (!ultima || !indice || !posicion?.isBufferAttribute) return null
  if (ultima.corte.posiciones.length !== posicion.count * 3) return null
  const ahora = pielSinAbultar(malla) ?? posicion.array
  if (ahora.length !== posicion.count * 3) return null
  malla.updateWorldMatrix(true, false)
  return { ahora, reposo: ultima.corte.posiciones, indices: indice.array, aMundo: malla.matrixWorld.clone() }
}

/**
 * La piel abultada sobre lo que la empuja, con lo que tenía debajo del bulto (D-421): el primer paso del trazo hacia lo que
 * se corta. Se pincha en la piel que se ve, hinchada sobre el trozo desplazado o sobre la placa, y todo lo demás —el
 * repaso, el cruce, alargar, el reposo de la herida— está medido sin el bulto. Sobre la tibia distal del caso 3 sube hasta
 * 30 mm: el trazo quedaba por encima de la hondura del corte de la piel («El trazo no atraviesa ninguna malla»), o la
 * cortaba de refilón, corta y plegada nada más abrirse, y la transversal no se reconocía como unida a la vertical, que
 * estaba guardada 30 mm más abajo.
 */
export function conSuBulto(malla: THREE.Mesh): MallaConReposo | null {
  const geometria = malla.geometry as THREE.BufferGeometry
  const posicion = geometria.getAttribute('position') as THREE.BufferAttribute | undefined
  const indice = geometria.getIndex()
  const base = pielSinAbultar(malla)
  if (!base || !indice || !posicion?.isBufferAttribute || base.length !== posicion.count * 3) return null
  malla.updateWorldMatrix(true, false)
  return { ahora: posicion.array, reposo: base, indices: indice.array, aMundo: malla.matrixWorld.clone() }
}

/**
 * La malla cerrada: con herida, la base de su último corte (`conSuReposo`); sin ella, tal como está, que es como está
 * cerrada. Es contra lo que se sigue el rayo del trazo hondo (`porElRayoHastaLaCapa`).
 */
export function cerradaDe(malla: THREE.Mesh): MallaConReposo | null {
  const conReposo = conSuReposo(malla)
  if (conReposo) return conReposo
  if (cadenaDeLaMalla(malla).length > 0) return null
  const geometria = malla.geometry as THREE.BufferGeometry
  const posicion = geometria.getAttribute('position') as THREE.BufferAttribute | undefined
  const indice = geometria.getIndex()
  if (!indice || !posicion?.isBufferAttribute) return null
  malla.updateWorldMatrix(true, false)
  return { ahora: posicion.array, reposo: posicion.array, indices: indice.array, aMundo: malla.matrixWorld.clone() }
}

/**
 * La malla tal como se dibuja ahora, abultada y abierta: contra ella se busca la piel que tapa el hueso que asoma
 * (`bajoLoQueLaTapa`), que es la que se ve alrededor de él.
 */
export function talComoSeVe(malla: THREE.Mesh): MallaConReposo | null {
  const geometria = malla.geometry as THREE.BufferGeometry
  const posicion = geometria.getAttribute('position') as THREE.BufferAttribute | undefined
  const indice = geometria.getIndex()
  if (!indice || !posicion?.isBufferAttribute) return null
  malla.updateWorldMatrix(true, false)
  return { ahora: posicion.array, reposo: posicion.array, indices: indice.array, aMundo: malla.matrixWorld.clone() }
}

/** Un punto llevado al reposo, con la normal de la piel ahí. */
export interface PuntoEnReposo {
  punto: Punto
  normal: Punto
}

/**
 * El trazo del bisturí profundo llevado a la capa que corta por el mismo rayo de la cámara con que se pinchó (D-421), o
 * `null` en cada punto cuyo rayo no da en ella a menos de `alcance` (en unidades del mundo) de donde se pinchó.
 *
 * El trazo se pincha en lo primero que se ve, y bajo la piel abierta eso casi nunca es la fascia. Puede ser el labio de la
 * piel, el trozo de tibia que asoma por la fascia abierta, o lo de muy al fondo, visto por el hueco de una incisión. En la
 * pierna del taller (caso 86), el repaso de la vertical en la T iba sobre el hueso, 6 a 10 mm por encima de la línea de la
 * fascia, más alto de lo que admite un repaso (`ALTURA_DEL_REPASO_MM`). La fascia se cortaba otra vez, en vez del músculo.
 * Y su última muestra se colaba por el hueco de la barra hasta el peroné, 30 mm más hondo: ese salto le añadía a la fascia
 * una rama de 43 mm que llegaba a la del pie. Siguiendo el rayo hasta la capa queda lo que hay en ella bajo cada píxel del
 * trazo, que es lo que se dibujó.
 *
 * Contra la malla **cerrada** (`cerradaDe`) y no la de ahora: por el hueco de su propia herida abierta el rayo pasaría de
 * largo, y es justo por ahí por donde va el repaso. De todo lo que el rayo cruza de la capa, lo primero desde el ojo: el
 * tabique intermuscular, que también es fascia, está detrás de la que cubre.
 */
export function porElRayoHastaLaCapa(
  puntos: readonly Punto[],
  ojo: Punto,
  mallas: readonly MallaConReposo[],
  alcance: number,
  /**
   * Solo lo que hay detrás del punto pinchado, desde esto antes de él (`bajoLoQueLaTapa`). Sin él, delante o detrás,
   * lo que caiga a `alcance`.
   */
  soloDetrasDesde?: number,
): (PuntoEnReposo | null)[] {
  const mejores: ({ t: number; punto: THREE.Vector3; normal: THREE.Vector3 } | null)[] = puntos.map(() => null)
  if (puntos.length === 0) return []
  // Solo los triángulos que pueden quedar a `alcance` de algún punto: la caja del trazo con ese margen.
  const caja = new THREE.Box3()
  for (const p of puntos) caja.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]))
  caja.expandByScalar(alcance)
  const ojoEnElMundo = new THREE.Vector3(ojo[0], ojo[1], ojo[2])
  const rayo = new THREE.Ray()
  const golpe = new THREE.Vector3()
  const triangulo = new THREE.Triangle()
  const normal = new THREE.Vector3()
  for (const malla of mallas) {
    const aLocal = malla.aMundo.clone().invert()
    const cajaLocal = caja.clone().applyMatrix4(aLocal)
    const { reposo, indices } = malla
    const nVertices = reposo.length / 3
    const cerca: number[] = []
    for (let t = 0; 3 * t + 2 < indices.length; t++) {
      const a = indices[3 * t]
      const b = indices[3 * t + 1]
      const c = indices[3 * t + 2]
      if (a >= nVertices || b >= nVertices || c >= nVertices) continue
      let fuera = false
      for (let k = 0; k < 3 && !fuera; k++) {
        const menor = Math.min(reposo[3 * a + k], reposo[3 * b + k], reposo[3 * c + k])
        const mayor = Math.max(reposo[3 * a + k], reposo[3 * b + k], reposo[3 * c + k])
        const [desde, hasta] = k === 0 ? [cajaLocal.min.x, cajaLocal.max.x] : k === 1 ? [cajaLocal.min.y, cajaLocal.max.y] : [cajaLocal.min.z, cajaLocal.max.z]
        fuera = mayor < desde || menor > hasta
      }
      if (!fuera) cerca.push(t)
    }
    if (cerca.length === 0) continue
    const ojoLocal = ojoEnElMundo.clone().applyMatrix4(aLocal)
    puntos.forEach((p, i) => {
      const pinchado = new THREE.Vector3(p[0], p[1], p[2])
      const hastaElPunto = pinchado.distanceTo(ojoEnElMundo)
      if (!(hastaElPunto > 0)) return
      const pLocal = pinchado.applyMatrix4(aLocal)
      rayo.set(ojoLocal, pLocal.sub(ojoLocal).normalize())
      for (const t of cerca) {
        leerTriangulo(triangulo, reposo, indices, t)
        if (!rayo.intersectTriangle(triangulo.a, triangulo.b, triangulo.c, false, golpe)) continue
        const enElMundo = golpe.clone().applyMatrix4(malla.aMundo)
        const distancia = enElMundo.distanceTo(ojoEnElMundo)
        if (Math.abs(distancia - hastaElPunto) > alcance) continue
        if (soloDetrasDesde !== undefined && distancia < hastaElPunto - soloDetrasDesde) continue
        const antes = mejores[i]
        if (antes && antes.t <= distancia) continue
        triangulo.getNormal(normal).transformDirection(malla.aMundo)
        // Hacia quien mira, como la del golpe del trazo (`normalDelGolpe`).
        const haciaElPunto = enElMundo.clone().sub(ojoEnElMundo)
        if (normal.dot(haciaElPunto) > 0) normal.negate()
        mejores[i] = { t: distancia, punto: enElMundo, normal: normal.clone() }
      }
    })
  }
  return mejores.map((m) => (m ? { punto: [m.punto.x, m.punto.y, m.punto.z] as const, normal: [m.normal.x, m.normal.y, m.normal.z] as const } : null))
}

/**
 * Lo pinchado del trazo de la piel sobre lo que asoma por ella, llevado a la piel que hay debajo por el mismo rayo de la
 * cámara (D-421), o `null` en cada punto que ya está en la piel o que no tiene piel detrás a menos de `alcance`.
 *
 * En la tibia distal del caso 3, el trozo desplazado asoma por la piel (`ABULTAMIENTO_MAXIMO_MM`: el bulto se queda en
 * 30 mm y el hueso sube 50). La barra de una T dibujada a través de él se pinchaba en el hueso, a más de 10 mm de la
 * piel, y esa mitad no cortaba nada: de 58 mm de trazo, la herida era de 15, 13 a un lado de la vertical y 1,6 al otro.
 * Con el pie de la vertical abierto en ella, la piel se plegaba contra esa punta de 1,6 mm: 43 triángulos vueltos y
 * esquirlas negras con los Farabeuf. Bajo cada píxel del hueso está la piel que él levanta, y es lo que se dibujó.
 *
 * Solo detrás del punto (`soloDetrasDesde`): lo visto por el hueco de una herida abierta tiene la piel delante, en sus
 * labios, y no hay que subirlo a ella; detrás, a menos de `alcance`, no hay piel, que la pierna es más gruesa.
 */
export function bajoLoQueLaTapa(
  puntos: readonly Punto[],
  ojo: Punto,
  pieles: readonly MallaConReposo[],
  alcance: number,
  /** Lo que se toma por la misma piel, en unidades del mundo: más cerca que esto, el punto ya estaba en ella. */
  enElla: number,
): (PuntoEnReposo | null)[] {
  return porElRayoHastaLaCapa(puntos, ojo, pieles, alcance, enElla).map((golpe, i) => {
    if (!golpe) return null
    const p = puntos[i]
    return Math.hypot(golpe.punto[0] - p[0], golpe.punto[1] - p[1], golpe.punto[2] - p[2]) <= enElla ? null : golpe
  })
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
