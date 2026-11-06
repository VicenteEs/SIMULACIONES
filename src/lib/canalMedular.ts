/**
 * El canal medular de una malla de hueso (P-012 E7, D-336): qué triángulos son de la cáscara de dentro.
 *
 * Desde D-336 los huesos largos del atlas traen dos cáscaras: la de fuera y la del canal, que va hundida en la
 * diáfisis y tiene las caras hacia dentro del canal, fuera del hueso. El archivo no las distingue —son la misma pieza,
 * y un trozo partido las lleva cortadas las dos— y aquí se reconocen por la forma, como las tapas de un corte
 * (`tapasDeCorte`). Así vale lo mismo para un hueso entero, para un trozo partido en el taller o en la consola, para
 * la malla fundida de un sistema y para un hueso de antes de D-336, que no tiene ninguna.
 *
 * Cómo:
 *
 * 1. Se sueldan los vértices por posición. El atlas repite vértices en las costuras, y `partirMalla` escribe dos
 *    veces los del contorno: sin soldar, una sola cáscara saldría en varios trozos.
 * 2. Se dejan fuera los triángulos de las tapas de corte (`excluir`): una tapa en anillo une, por posición, el borde
 *    de la cáscara de fuera con el del canal, y con ella las dos serían una.
 * 3. Se juntan los triángulos que comparten un vértice soldado, y de cada parte se suma, triángulo a triángulo,
 *    cuánto mira su cara hacia fuera de su centro: ∑ (c_t − c) · n_t · área_t, con `c` el centro de la parte. En una
 *    cáscara cerrada es el triple de su volumen, y no depende de `c`. En un trozo de tubo, abierto por un corte, ya no
 *    es un volumen, pero con `c` en su centro sigue saliendo positiva en la cara de fuera, que mira hacia fuera del
 *    eje, y negativa en la del canal, que mira hacia él.
 * 4. Es canal la parte que mira hacia dentro **y está dentro de otra**, mayor y que mira hacia fuera: su caja cabe en
 *    la de aquella. Sin esto, una pieza del atlas con todas las caras al revés —una sola parte, vuelta— se tomaría
 *    entera por canal, y se pintaría de médula y desaparecería de la radiografía.
 *
 * Va sin three, como `aspectoAnatomico.ts`, para probarlo en node con mallas hechas a mano.
 */

export interface OpcionesDelCanal {
  /**
   * Los ÍNDICES que se miran, como en `ejeDelHueso`: una pieza dentro de la malla fundida de su sistema. Por omisión,
   * todos.
   */
  inicio?: number
  cuenta?: number
  /**
   * Los vértices de las tapas de corte (1 en cada uno, como lo da `verticesDeLasTapas`): un triángulo con los tres
   * así no cuenta.
   */
  excluir?: ArrayLike<number> | null
}

/**
 * 1 en cada triángulo del canal medular, 0 en los demás, en el orden de los triángulos del tramo: el primero es el de
 * los índices `inicio` a `inicio + 2`. Sin `indices`, cada tres vértices seguidos son un triángulo.
 */
export function triangulosDelCanal(
  posiciones: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  { inicio = 0, cuenta, excluir = null }: OpcionesDelCanal = {},
): Uint8Array {
  const vertices = Math.floor(posiciones.length / 3)
  const total = indices ? indices.length : vertices - (vertices % 3)
  const n = cuenta ?? total - inicio
  const triangulos = Math.max(0, Math.floor(n / 3))
  const salida = new Uint8Array(triangulos)
  if (triangulos === 0) return salida
  const indice = (k: number) => (indices ? indices[inicio + k] : inicio + k)

  // La escala de la soldadura: la caja de los vértices del tramo, para que una pieza mida igual sola que fundida con
  // las de su sistema.
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  for (let k = 0; k < triangulos * 3; k++) {
    const v = indice(k)
    if (v >= vertices) continue
    const x = posiciones[v * 3], y = posiciones[v * 3 + 1], z = posiciones[v * 3 + 2]
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (z < z0) z0 = z
    if (x > x1) x1 = x
    if (y > y1) y1 = y
    if (z > z1) z1 = z
  }
  const diagonal = Math.hypot(x1 - x0, y1 - y0, z1 - z0) || 1

  // 1. Soldar: un número por posición, a la millonésima de la caja.
  const soldado = new Int32Array(vertices).fill(-1)
  const porClave = new Map<string, number>()
  let unicos = 0
  const soldar = (v: number) => {
    if (soldado[v] >= 0) return soldado[v]
    const clave = `${Math.round((posiciones[v * 3] / diagonal) * 1e6)},${Math.round((posiciones[v * 3 + 1] / diagonal) * 1e6)},${Math.round((posiciones[v * 3 + 2] / diagonal) * 1e6)}`
    let s = porClave.get(clave)
    if (s === undefined) {
      s = unicos++
      porClave.set(clave, s)
    }
    soldado[v] = s
    return s
  }

  // 2 y 3. Juntar por vértice soldado, sin las tapas ni los triángulos sin área.
  const padre: number[] = []
  const raiz = (a: number): number => {
    let r = a
    while (padre[r] !== r) r = padre[r]
    while (padre[a] !== r) {
      const siguiente = padre[a]
      padre[a] = r
      a = siguiente
    }
    return r
  }
  const unir = (a: number, b: number) => {
    const ra = raiz(a), rb = raiz(b)
    if (ra !== rb) padre[ra] = rb
  }
  const normalPorArea = new Float64Array(triangulos * 3)
  const area = new Float64Array(triangulos)
  const vale = new Uint8Array(triangulos)
  const verts = new Int32Array(triangulos * 3)
  for (let t = 0; t < triangulos; t++) {
    const a = indice(3 * t), b = indice(3 * t + 1), c = indice(3 * t + 2)
    if (a >= vertices || b >= vertices || c >= vertices) continue
    if (excluir && excluir[a] && excluir[b] && excluir[c]) continue
    const ax = posiciones[a * 3], ay = posiciones[a * 3 + 1], az = posiciones[a * 3 + 2]
    const ux = posiciones[b * 3] - ax, uy = posiciones[b * 3 + 1] - ay, uz = posiciones[b * 3 + 2] - az
    const wx = posiciones[c * 3] - ax, wy = posiciones[c * 3 + 1] - ay, wz = posiciones[c * 3 + 2] - az
    // El doble del área, como vector: la normal de la cara por su área.
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const doble = Math.hypot(nx, ny, nz)
    if (!(doble > 0)) continue
    vale[t] = 1
    area[t] = doble / 2
    normalPorArea[3 * t] = nx / 2
    normalPorArea[3 * t + 1] = ny / 2
    normalPorArea[3 * t + 2] = nz / 2
    const sa = soldar(a), sb = soldar(b), sc = soldar(c)
    while (padre.length < unicos) padre.push(padre.length)
    unir(sa, sb)
    unir(sb, sc)
    verts[3 * t] = a
    verts[3 * t + 1] = b
    verts[3 * t + 2] = c
  }

  // El centro de cada parte, pesado por el área, y su caja.
  const parte = new Int32Array(triangulos).fill(-1)
  const numero = new Map<number, number>()
  const centros: number[] = []
  const areas: number[] = []
  const cajas: number[] = []
  const centroDe = (t: number, e: number) =>
    (posiciones[verts[3 * t] * 3 + e] + posiciones[verts[3 * t + 1] * 3 + e] + posiciones[verts[3 * t + 2] * 3 + e]) / 3
  for (let t = 0; t < triangulos; t++) {
    if (!vale[t]) continue
    const r = raiz(soldado[verts[3 * t]])
    let p = numero.get(r)
    if (p === undefined) {
      p = areas.length
      numero.set(r, p)
      areas.push(0)
      centros.push(0, 0, 0)
      cajas.push(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity)
    }
    parte[t] = p
    areas[p] += area[t]
    for (let e = 0; e < 3; e++) {
      centros[3 * p + e] += area[t] * centroDe(t, e)
      for (let k = 0; k < 3; k++) {
        const x = posiciones[verts[3 * t + k] * 3 + e]
        if (x < cajas[6 * p + e]) cajas[6 * p + e] = x
        if (x > cajas[6 * p + 3 + e]) cajas[6 * p + 3 + e] = x
      }
    }
  }
  for (let p = 0; p < areas.length; p++) for (let e = 0; e < 3; e++) centros[3 * p + e] /= areas[p] || 1

  // Hacia dónde mira cada parte respecto de su centro.
  const mira = new Float64Array(areas.length)
  for (let t = 0; t < triangulos; t++) {
    const p = parte[t]
    if (p < 0) continue
    let s = 0
    for (let e = 0; e < 3; e++) s += (centroDe(t, e) - centros[3 * p + e]) * normalPorArea[3 * t + e]
    mira[p] += s
  }
  // Una parte plana (lo que quede de una tapa, un triángulo suelto) da cero, o casi: no es canal. Se exige que lo
  // negativo sea de verdad, en proporción a su tamaño.
  const holgura = 1e-6 * diagonal
  const cabe = (p: number, q: number) => {
    for (let e = 0; e < 3; e++) {
      if (cajas[6 * p + e] < cajas[6 * q + e] - holgura || cajas[6 * p + 3 + e] > cajas[6 * q + 3 + e] + holgura) return false
    }
    return true
  }
  const haciaFuera = areas.map((a, q) => mira[q] > 1e-4 * a * Math.sqrt(a))
  const esCanal = areas.map(
    (a, p) => mira[p] < -1e-4 * a * Math.sqrt(a) && areas.some((b, q) => q !== p && haciaFuera[q] && b > a && cabe(p, q)),
  )
  for (let t = 0; t < triangulos; t++) if (parte[t] >= 0 && esCanal[parte[t]]) salida[t] = 1
  return salida
}

/**
 * 1 en cada vértice de un triángulo del canal medular (ver `triangulosDelCanal`), 0 en los demás: lo que va al
 * atributo del sombreador. Los vértices del canal no los comparte ningún triángulo de fuera —la cáscara del canal es
 * otra—, así que la marca no se corre a la cara de fuera.
 */
export function verticesDelCanal(
  posiciones: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  opciones: OpcionesDelCanal = {},
): Uint8Array {
  const vertices = Math.floor(posiciones.length / 3)
  const marca = new Uint8Array(vertices)
  const inicio = opciones.inicio ?? 0
  const delCanal = triangulosDelCanal(posiciones, indices, opciones)
  for (let t = 0; t < delCanal.length; t++) {
    if (!delCanal[t]) continue
    for (let k = 0; k < 3; k++) {
      const v = indices ? indices[inicio + 3 * t + k] : inicio + 3 * t + k
      if (v < vertices) marca[v] = 1
    }
  }
  return marca
}
