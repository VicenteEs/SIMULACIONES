import type { MallaIndexada, PlanoDeLaMalla, ParticionPorPlanos } from '@/lib/osteotomia'

/**
 * Cortar una lámina por un plano **sin taparla** (P-006, F-7).
 *
 * `osteotomia.ts` parte un hueso: corta por el plano y **tapa** cada contorno que cierra, porque un
 * hueso del atlas es una cáscara y, sin tapa, el fragmento que se mueve se ve hueco justo donde el
 * residente mira. Una fascia es lo contrario: un manguito que envuelve un miembro. Cortado por un
 * plano deja un anillo abierto, y tapar ese anillo con `partirMalla` pondría un disco de fascia
 * cruzando la pierna por dentro, donde está el músculo.
 *
 * Esto hace el mismo corte limpio —los triángulos que cruzan el plano se parten por el plano, no se
 * quedan enteros con el borde en dientes de sierra— y no añade nada. Es pura aritmética sobre
 * arrays, sin `three`, como el resto de lo que se prueba sin lienzo. Lo usan el marco que corta del
 * taller, la reproducción de una preparación en el servidor y el recorte a la zona al exportar.
 *
 * Es la misma cuenta que `recortar_por_planos` de `scripts/atlas/fascias/malla.py`, con la misma
 * regla de interpolar cada arista desde el extremo de dentro al de fuera: dos piezas vecinas, cortadas
 * por el mismo plano con la normal contraria, dan el mismo punto con la diferencia de un redondeo.
 */

type V3 = readonly [number, number, number]

const unitario = (n: V3): [number, number, number] => {
  const l = Math.hypot(n[0], n[1], n[2])
  if (!(l > 0)) throw new Error('El plano de corte tiene una normal nula.')
  return [n[0] / l, n[1] / l, n[2] / l]
}

/**
 * Lo que queda de la malla del lado de la normal de un plano.
 *
 * Un vértice exactamente sobre el plano cuenta como «dentro», como en `recortar_por_planos`. Si el
 * plano no corta nada y todo queda dentro, devuelve **la misma malla**, no una copia: quien compara
 * sabe así que no pasó nada, y exportar sin recorte da el archivo de siempre byte a byte.
 *
 * Las normales de los vértices nuevos se interpolan con el mismo `t` que la posición y se vuelven
 * a normalizar: es lo que mantiene el sombreado continuo entre dos piezas vecinas. Salen en el tipo
 * en que entraron (enteros de 16 bits del atlas o flotantes).
 */
export function recortarSinTapaPorUnPlano(malla: MallaIndexada, plano: PlanoDeLaMalla): MallaIndexada {
  const [nx, ny, nz] = unitario(plano.normal)
  const { posiciones, normales, indices } = malla
  const vertices = Math.floor(posiciones.length / 3)
  const triangulos = Math.floor(indices.length / 3)

  const d = new Float64Array(vertices)
  for (let v = 0; v < vertices; v += 1) {
    d[v] =
      (posiciones[v * 3] - plano.punto[0]) * nx +
      (posiciones[v * 3 + 1] - plano.punto[1]) * ny +
      (posiciones[v * 3 + 2] - plano.punto[2]) * nz
  }

  let todosDentro = true
  for (let t = 0; t < triangulos && todosDentro; t += 1) {
    if (d[indices[t * 3]] < 0 || d[indices[t * 3 + 1]] < 0 || d[indices[t * 3 + 2]] < 0) todosDentro = false
  }
  if (todosDentro && indices.length === triangulos * 3) return malla

  const esEntera = normales instanceof Int16Array
  const escala = esEntera ? 32767 : 1
  const nuevasPos: number[] = []
  const nuevasNor: number[] = []
  const cortes = new Map<number, number>()

  /** El vértice de la arista (dentro → fuera), compartido por los dos triángulos que la tocan. */
  const cruce = (dentro: number, fuera: number): number => {
    const clave = dentro * vertices + fuera
    const hecho = cortes.get(clave)
    if (hecho !== undefined) return hecho
    const t = d[dentro] / (d[dentro] - d[fuera])
    for (let e = 0; e < 3; e += 1) {
      const a = posiciones[dentro * 3 + e]
      nuevasPos.push(a + t * (posiciones[fuera * 3 + e] - a))
    }
    const a = [normales[dentro * 3] / escala, normales[dentro * 3 + 1] / escala, normales[dentro * 3 + 2] / escala]
    const b = [normales[fuera * 3] / escala, normales[fuera * 3 + 1] / escala, normales[fuera * 3 + 2] / escala]
    const m = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]
    const l = Math.hypot(m[0], m[1], m[2]) || 1
    for (let e = 0; e < 3; e += 1) nuevasNor.push(esEntera ? Math.round((m[e] / l) * 32767) : m[e] / l)
    const id = vertices + cortes.size
    cortes.set(clave, id)
    return id
  }

  const salida: number[] = []
  for (let t = 0; t < triangulos; t += 1) {
    const i = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]]
    const dentro = [d[i[0]] >= 0, d[i[1]] >= 0, d[i[2]] >= 0]
    const cuantos = (dentro[0] ? 1 : 0) + (dentro[1] ? 1 : 0) + (dentro[2] ? 1 : 0)
    if (cuantos === 3) {
      salida.push(i[0], i[1], i[2])
    } else if (cuantos === 1) {
      // Queda un triángulo más pequeño: (i, p_ij, p_ik), con el de dentro primero y el giro intacto.
      const k = dentro.indexOf(true)
      const a = i[k]
      const b = i[(k + 1) % 3]
      const c = i[(k + 2) % 3]
      salida.push(a, cruce(a, b), cruce(a, c))
    } else if (cuantos === 2) {
      // Queda un cuadrilátero (a, b, p_bc, p_ac), con c el de fuera: dos triángulos.
      const k = dentro.indexOf(false)
      const c = i[k]
      const a = i[(k + 1) % 3]
      const b = i[(k + 2) % 3]
      const pbc = cruce(b, c)
      const pac = cruce(a, c)
      salida.push(a, b, pbc, a, pbc, pac)
    }
  }

  // Compactar: solo los vértices que algún triángulo usa, en su orden original (el mismo archivo en
  // dos exportaciones), y los índices corridos.
  const total = vertices + cortes.size
  const usado = new Uint8Array(total)
  for (const v of salida) usado[v] = 1
  const nuevo = new Uint32Array(total)
  let quedan = 0
  for (let v = 0; v < total; v += 1) {
    if (usado[v]) {
      nuevo[v] = quedan
      quedan += 1
    }
  }
  const pos = new Float32Array(quedan * 3)
  const nor = esEntera ? new Int16Array(quedan * 3) : new Float32Array(quedan * 3)
  for (let v = 0; v < total; v += 1) {
    if (!usado[v]) continue
    const destino = nuevo[v] * 3
    for (let e = 0; e < 3; e += 1) {
      if (v < vertices) {
        pos[destino + e] = posiciones[v * 3 + e]
        nor[destino + e] = normales[v * 3 + e]
      } else {
        pos[destino + e] = nuevasPos[(v - vertices) * 3 + e]
        nor[destino + e] = nuevasNor[(v - vertices) * 3 + e]
      }
    }
  }
  const idx = new Uint32Array(salida.length)
  for (let k = 0; k < salida.length; k += 1) idx[k] = nuevo[salida[k]]
  return { posiciones: pos, normales: nor, indices: idx }
}

/** Lo que queda del lado de la normal de **todos** los planos, sin tapar ninguno. */
export function recortarSinTapa(malla: MallaIndexada, planos: readonly PlanoDeLaMalla[]): MallaIndexada {
  let resto = malla
  for (const plano of planos) {
    if (resto.indices.length === 0) break
    resto = recortarSinTapaPorUnPlano(resto, plano)
  }
  return resto
}

const invertido = (plano: PlanoDeLaMalla): PlanoDeLaMalla => ({
  punto: plano.punto,
  normal: [-plano.normal[0], -plano.normal[1], -plano.normal[2]],
})

/** Pega mallas en una sola, corriendo los índices. */
export function unirSinTapa(mallas: readonly MallaIndexada[]): MallaIndexada {
  const entera = mallas.every((m) => m.normales instanceof Int16Array)
  const vertices = mallas.reduce((t, m) => t + m.posiciones.length / 3, 0)
  const triangulos = mallas.reduce((t, m) => t + m.indices.length, 0)
  const posiciones = new Float32Array(vertices * 3)
  const normales = entera ? new Int16Array(vertices * 3) : new Float32Array(vertices * 3)
  const indices = new Uint32Array(triangulos)
  let v = 0
  let i = 0
  for (const m of mallas) {
    posiciones.set(m.posiciones, v * 3)
    // Con una mezcla de tipos se pasa a flotantes; con todas enteras se conservan.
    if (entera || m.normales instanceof Float32Array) normales.set(m.normales as never, v * 3)
    else for (let k = 0; k < m.normales.length; k += 1) normales[v * 3 + k] = m.normales[k] / 32767
    for (let k = 0; k < m.indices.length; k += 1) indices[i + k] = m.indices[k] + v
    v += m.posiciones.length / 3
    i += m.indices.length
  }
  return { posiciones, normales, indices }
}

/**
 * Parte una lámina por varios planos a la vez, como lo hace el marco del taller con un hueso
 * (`partirPorVariosPlanos`), pero sin tapas: `dentro` es lo que queda del lado de la normal de todos
 * los planos y `fuera`, todo lo demás en una sola malla.
 *
 * `fuera` se arma plano a plano: lo que cae dentro de los anteriores y fuera de este. Así un
 * triángulo se reparte entre una pieza y otra sin repetirse, y la suma de las dos es la lámina
 * entera. Devuelve también qué planos partieron algo, para guardar en el corte solo esos (como
 * `ParticionPorPlanos`).
 */
export function partirPorVariosPlanosSinTapa(
  malla: MallaIndexada,
  planos: readonly PlanoDeLaMalla[],
): ParticionPorPlanos {
  const fuera: MallaIndexada[] = []
  const planosQueCortan: number[] = []
  let resto: MallaIndexada | null = malla
  for (const [k, plano] of planos.entries()) {
    if (!resto || resto.indices.length === 0) break
    const dentro = recortarSinTapaPorUnPlano(resto, plano)
    const contra = recortarSinTapaPorUnPlano(resto, invertido(plano))
    // Cuántos triángulos quedan de cada lado: un plano que deja todo de un lado no parte nada. Se
    // compara el recuento y no la identidad, porque un vértice sobre el plano cuenta como dentro de
    // los dos.
    const sinContra = contra.indices.length === 0
    const sinDentro = dentro.indices.length === 0
    if (sinContra) continue
    if (sinDentro) {
      fuera.push(resto)
      resto = null
      break
    }
    planosQueCortan.push(k)
    fuera.push(contra)
    resto = dentro
  }
  return {
    dentro: resto && resto.indices.length > 0 ? resto : null,
    fuera: fuera.length > 0 ? unirSinTapa(fuera) : null,
    planosQueCortan,
    avisos: [],
  }
}

/** Parte una lámina por un solo plano: la mitad hacia la normal y la otra. */
export function partirSinTapaPorUnPlano(
  malla: MallaIndexada,
  plano: PlanoDeLaMalla,
): { haciaLaNormal: MallaIndexada; contraLaNormal: MallaIndexada; avisos: string[] } {
  return {
    haciaLaNormal: recortarSinTapaPorUnPlano(malla, plano),
    contraLaNormal: recortarSinTapaPorUnPlano(malla, invertido(plano)),
    avisos: [],
  }
}
