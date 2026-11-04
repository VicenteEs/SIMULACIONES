/**
 * La reducción automática de un hueso partido en trozos (P-008 E5): dónde va cada trozo, sacado de sus caras de corte.
 *
 * Un hueso partido con cortes planos —el «Recortar» del atlas (D-141), o un corte en Blender— lleva en cada trozo una
 * tapa plana por cada corte, y las dos tapas de un mismo corte comparten **los mismos vértices**: el corte calcula una
 * vez dónde cruza cada arista y los dos lados se quedan con ese punto. Mover los trozos para enseñar la fractura no lo
 * cambia, porque mover un trozo no lo deforma. Encajar dos trozos es, entonces, buscar el movimiento rígido que vuelve a
 * poner esos vértices uno encima de otro; y reducir el hueso entero, encadenar esos encajes desde un trozo que se queda
 * quieto.
 *
 * Por qué así y no de otra manera:
 *  - Contra el hueso sano del atlas, como plantilla, haría falta tenerlo cargado en el simulador, y un modelo hecho en
 *    Blender no trae ninguno. Las caras de corte, en cambio, las trae todo modelo partido.
 *  - Encajar las tapas por su forma (centro, normal, contorno) da un sitio aproximado, y una reducción que deja medio
 *    milímetro de escalón en cada corte se ve. Los vértices compartidos dan el sitio exacto; y si no coinciden es que
 *    esas dos tapas no son del mismo corte, que también es información.
 *  - Lo que no resuelve: una fractura esculpida a mano, sin tapas planas, o un trozo cuyos vértices de corte se perdieron
 *    al simplificar la malla. Para eso está colocarlo a mano y guardar esa posición como la reducida.
 *
 * Todo en las unidades del modelo y en un marco común a los trozos —el del archivo—: las tolerancias, que se piensan en
 * milímetros, se pasan a unidades con `milimetrosPorUnidad`.
 */

import * as THREE from 'three'

/** Un movimiento rígido: primero el giro (cuaternión) y después la traslación, en las unidades del modelo. */
export interface TransformacionRigida {
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
}

/** Un trozo tal como está en el archivo: sus vértices en el marco común y sus triángulos. */
export interface TrozoParaReducir {
  nodo: string
  /** Coordenadas de tres en tres. */
  posiciones: ArrayLike<number>
  /** Vértices de tres en tres; sin índices, cada tres vértices seguidos son un triángulo. */
  indices: ArrayLike<number> | null
}

export interface OpcionesDeLaReduccion {
  milimetrosPorUnidad: number
  /** El trozo que se queda quieto. Sin él, el más grande de cada hueso. */
  ancla?: string | null
  /** Cuánto pueden distar dos vértices del mismo corte para contar como uno, en milímetros. */
  toleranciaMm?: number
}

export interface TrozoColocado {
  nodo: string
  /** Lo que lleva el trozo de donde está en el archivo a donde va. */
  transformacion: TransformacionRigida
  /** El trozo contra el que se encajó y cuántos vértices de corte coinciden. */
  sobre: string
  vertices: number
  /** Lo que se separan, de media, los vértices que coinciden, ya encajados. */
  errorMm: number
  /** Cuánto se mueve el centro del trozo y cuánto gira: lo que se le cuenta al editor. */
  desplazamientoMm: number
  giroGrados: number
}

export interface ResultadoDeLaReduccion {
  /** Los trozos que se quedan quietos: uno por hueso partido. */
  anclas: string[]
  /** Los que se mueven, cada uno con su encaje. */
  colocados: TrozoColocado[]
  /** Trozos con caras de corte que no encajan con ningún otro. */
  sueltos: string[]
}

/** Lo que se considera ya en su sitio: no merece guardarse ni moverse. */
export const QUIETO_MM = 0.01
export const QUIETO_GRADOS = 0.01

const TOLERANCIA_MM = 0.1
/** Triángulos más pequeños que esto tienen la normal demasiado ruidosa para decidir de qué plano son. */
const AREA_MINIMA_MM2 = 0.001
/** Una tapa de verdad tiene unos cuantos triángulos y vértices: dos triángulos planos juntos son casualidad. */
const TRIANGULOS_DE_UNA_TAPA = 3
const VERTICES_DE_UNA_TAPA = 5
const AREA_DE_UNA_TAPA_MM2 = 1
/** Por debajo de esta parte de su superficie en tapas, un objeto sin pareja no se cuenta como trozo suelto. */
const PARTE_DE_TAPA = 0.02

export const IDENTIDAD: TransformacionRigida = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }

export function matrizDe(t: TransformacionRigida, destino = new THREE.Matrix4()): THREE.Matrix4 {
  const giro = new THREE.Quaternion(t.qx, t.qy, t.qz, t.qw).normalize()
  return destino.compose(new THREE.Vector3(t.x, t.y, t.z), giro, new THREE.Vector3(1, 1, 1))
}

export function transformacionDe(m: THREE.Matrix4): TransformacionRigida {
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  m.decompose(p, q, new THREE.Vector3())
  return { x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w }
}

/**
 * La transformación guardada en una pieza del caso, o `null`.
 *
 * Lo que llega de la base no se da por bueno: una fila con un número de menos, o un cuaternión que no es un giro,
 * movería el trozo a cualquier parte, y el residente vería un hueso roto donde el editor dejó uno reducido. Mejor
 * ignorarla y que el trozo se quede donde está en el archivo.
 */
export function transformacionValida(valor: unknown): TransformacionRigida | null {
  if (!valor || typeof valor !== 'object') return null
  const v = valor as Record<string, unknown>
  const claves = ['x', 'y', 'z', 'qx', 'qy', 'qz', 'qw'] as const
  if (!claves.every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]))) return null
  const t = Object.fromEntries(claves.map((k) => [k, v[k] as number])) as unknown as TransformacionRigida
  const largo = Math.hypot(t.qx, t.qy, t.qz, t.qw)
  if (Math.abs(largo - 1) > 1e-3) return null
  return { ...t, qx: t.qx / largo, qy: t.qy / largo, qz: t.qz / largo, qw: t.qw / largo }
}

/** Cuánto gira un cuaternión, en grados. */
export function gradosDelGiro(t: TransformacionRigida): number {
  return (2 * Math.acos(Math.min(1, Math.abs(t.qw))) * 180) / Math.PI
}

// ------------------------------------------------------------------ las tapas

interface Tapa {
  /** Vértices sin repetir, en el marco común. */
  vertices: THREE.Vector3[]
  /** Hacia fuera del trozo: es el sentido en que miran sus triángulos. */
  normal: THREE.Vector3
  centro: THREE.Vector3
}

interface TrozoAnalizado {
  nodo: string
  tapas: Tapa[]
  /** La superficie del trozo: elige el ancla. */
  area: number
  /** Cuánta de esa superficie son tapas: distingue un trozo de hueso partido del resto del esqueleto. */
  areaDeTapas: number
  /** El centro de sus vértices: mide cuánto se movió. */
  centro: THREE.Vector3
}

interface Grupo {
  normal: THREE.Vector3
  distancia: number
  area: number
  triangulos: number[]
}

function analizar(trozo: TrozoParaReducir, unidad: number): TrozoAnalizado {
  const pos = trozo.posiciones
  const idx = trozo.indices
  const triangulos = Math.floor((idx ? idx.length : pos.length / 3) / 3)
  const vertice = (t: number, k: number) => (idx ? idx[3 * t + k] : 3 * t + k)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const leer = (v: THREE.Vector3, i: number) => v.set(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2])
  const areaMinima = AREA_MINIMA_MM2 * unidad * unidad
  // Primero se agrupa por un plano redondeado —una clave por triángulo, en un solo recorrido—, porque el resto del
  // esqueleto puede pasar de cien mil triángulos y compararlos todos entre sí no acaba. Después se juntan los grupos
  // que el redondeo partió por caer justo en un borde.
  const grupos = new Map<string, Grupo>()
  const paso = 0.25 * unidad
  let area = 0
  const centro = new THREE.Vector3()
  for (let i = 0; i < pos.length / 3; i++) centro.add(leer(a, i))
  if (pos.length > 0) centro.divideScalar(pos.length / 3)
  for (let t = 0; t < triangulos; t++) {
    leer(a, vertice(t, 0))
    leer(b, vertice(t, 1))
    leer(c, vertice(t, 2))
    n.subVectors(b, a).cross(c.sub(a))
    const doble = n.length()
    area += doble / 2
    if (doble / 2 < areaMinima) continue
    n.divideScalar(doble)
    const d = n.dot(a)
    const clave = `${Math.round(n.x * 60)},${Math.round(n.y * 60)},${Math.round(n.z * 60)},${Math.round(d / paso)}`
    let g = grupos.get(clave)
    if (!g) {
      g = { normal: new THREE.Vector3(), distancia: 0, area: 0, triangulos: [] }
      grupos.set(clave, g)
    }
    g.normal.addScaledVector(n, doble / 2)
    g.distancia += (d * doble) / 2
    g.area += doble / 2
    g.triangulos.push(t)
  }
  const juntos: Grupo[] = []
  for (const g of grupos.values()) {
    if (g.triangulos.length < 2) continue
    g.normal.normalize()
    g.distancia /= g.area
    const igual = juntos.find((h) => h.normal.dot(g.normal) > Math.cos((0.5 * Math.PI) / 180) && Math.abs(h.distancia - g.distancia) < 0.02 * unidad)
    if (!igual) {
      juntos.push(g)
      continue
    }
    igual.normal.multiplyScalar(igual.area).addScaledVector(g.normal, g.area).normalize()
    igual.distancia = (igual.distancia * igual.area + g.distancia * g.area) / (igual.area + g.area)
    igual.area += g.area
    igual.triangulos.push(...g.triangulos)
  }

  const tapas: Tapa[] = []
  let areaDeTapas = 0
  const cuanto = 1e-4 * unidad
  for (const g of juntos) {
    if (g.triangulos.length < TRIANGULOS_DE_UNA_TAPA || g.area < AREA_DE_UNA_TAPA_MM2 * unidad * unidad) continue
    // Sin repetir: el glTF parte un vértice en varios cuando cambia la normal o la textura, y la tapa lo comparte con
    // el hueso de alrededor.
    const vistos = new Map<string, THREE.Vector3>()
    for (const t of g.triangulos) {
      for (let k = 0; k < 3; k++) {
        const p = leer(new THREE.Vector3(), vertice(t, k))
        const clave = `${Math.round(p.x / cuanto)},${Math.round(p.y / cuanto)},${Math.round(p.z / cuanto)}`
        if (!vistos.has(clave)) vistos.set(clave, p)
      }
    }
    if (vistos.size < VERTICES_DE_UNA_TAPA) continue
    const vertices = [...vistos.values()]
    const centroDeLaTapa = vertices.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(vertices.length)
    tapas.push({ vertices, normal: g.normal.clone(), centro: centroDeLaTapa })
    areaDeTapas += g.area
  }
  return { nodo: trozo.nodo, tapas, area, areaDeTapas, centro }
}

// --------------------------------------------------------- encajar dos tapas

interface Encaje {
  /** Lleva el trozo de la tapa `b` junto al de la tapa `a`, con `a` donde está. */
  matriz: THREE.Matrix4
  vertices: number
  errorMm: number
}

function perpendicular(n: THREE.Vector3): THREE.Vector3 {
  const otro = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  return otro.sub(n.clone().multiplyScalar(otro.dot(n))).normalize()
}

interface TapaPreparada {
  /** Los vértices en el plano de la tapa, en una base suya (`u`, `v`). */
  enA: (readonly [number, number])[]
  u: THREE.Vector3
  v: THREE.Vector3
  /** El vértice de la tapa a menos de la tolerancia de un punto del plano, o −1. */
  vecino: (x: number, y: number) => number
  /** Todas las parejas de vértices, en arreglos y con su orden por distancia. */
  parejas: { d: Float64Array; i: Uint32Array; j: Uint32Array; orden: Uint32Array }
  /** La primera pareja, en ese orden, que no está más cerca que `d`. */
  desde: (d: number) => number
}

const preparadas = new WeakMap<Tapa, TapaPreparada>()

/**
 * Lo que de la tapa fija no depende de con cuál se compare: su proyección en su plano, una rejilla para buscar vecinos
 * y sus parejas de vértices ordenadas por distancia. Cada tapa se compara con todas las de los demás trozos, y rehacer
 * esto en cada comparación era lo que más costaba.
 */
function preparar(a: Tapa, tolerancia: number): TapaPreparada {
  const hecha = preparadas.get(a)
  if (hecha) return hecha
  const u = perpendicular(a.normal)
  const v = a.normal.clone().cross(u)
  const enA = a.vertices.map((p) => {
    const d = p.clone().sub(a.centro)
    return [d.dot(u), d.dot(v)] as const
  })
  // Una rejilla de lado `tolerancia`: buscar al vecino es mirar nueve casillas.
  const rejilla = new Map<string, number[]>()
  enA.forEach(([x, y], i) => {
    const k = `${Math.floor(x / tolerancia)},${Math.floor(y / tolerancia)}`
    const lista = rejilla.get(k)
    if (lista) lista.push(i)
    else rejilla.set(k, [i])
  })
  const vecino = (x: number, y: number): number => {
    const cx = Math.floor(x / tolerancia)
    const cy = Math.floor(y / tolerancia)
    let mejor = -1
    let menor = tolerancia * tolerancia
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of rejilla.get(`${cx + dx},${cy + dy}`) ?? []) {
          const d = (enA[i][0] - x) ** 2 + (enA[i][1] - y) ** 2
          if (d <= menor) {
            menor = d
            mejor = i
          }
        }
      }
    return mejor
  }
  const n = enA.length
  const total = (n * (n - 1)) / 2
  const parejas = { d: new Float64Array(total), i: new Uint32Array(total), j: new Uint32Array(total), orden: new Uint32Array(total) }
  let k = 0
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++, k++) {
      parejas.d[k] = Math.hypot(enA[j][0] - enA[i][0], enA[j][1] - enA[i][1])
      parejas.i[k] = i
      parejas.j[k] = j
      parejas.orden[k] = k
    }
  parejas.orden.sort((p, q) => parejas.d[p] - parejas.d[q])
  const desde = (d: number) => {
    let lo = 0
    let hi = total
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (parejas.d[parejas.orden[m]] < d) lo = m + 1
      else hi = m
    }
    return lo
  }
  const preparada = { enA, u, v, vecino, parejas, desde }
  preparadas.set(a, preparada)
  return preparada
}

/**
 * Encaja la tapa `b` sobre la `a`: enfrentadas —una normal contra la otra— y con el máximo de vértices uno encima de
 * otro.
 *
 * Con las dos en el mismo plano solo queda un giro en ese plano y un desplazamiento, y eso lo fijan dos vértices: se
 * prueban parejas de `b` contra parejas de `a` que estén a la misma distancia, y gana la hipótesis con más vértices que
 * caen sobre uno de `a`. Una tapa partida por un corte posterior comparte solo una parte de sus vértices con la de
 * enfrente; por eso no se exige que coincidan todos, sino una parte suficiente para que no sea casualidad.
 */
function encajarTapas(a: Tapa, b: Tapa, tolerancia: number, unidad: number): Encaje | null {
  const { enA, u, v, vecino, parejas, desde } = preparar(a, tolerancia)
  const enfrentar = new THREE.Quaternion().setFromUnitVectors(b.normal, a.normal.clone().negate())
  const enB = b.vertices.map((p) => {
    const d = p.clone().sub(b.centro).applyQuaternion(enfrentar)
    return [d.dot(u), d.dot(v)] as const
  })
  const na = enA.length

  // Ocho vértices de `b` repartidos alrededor de su centro, y todas sus parejas que no estén demasiado juntas: dos
  // vértices pegados dan mal el giro.
  const nb = enB.length
  const porAngulo = [...enB.keys()].sort((i, j) => Math.atan2(enB[i][1], enB[i][0]) - Math.atan2(enB[j][1], enB[j][0]))
  const muestras = Array.from({ length: Math.min(8, nb) }, (_, k) => porAngulo[Math.floor((k * nb) / Math.min(8, nb))])
  const parejasDeB: [number, number][] = []
  for (let s = 0; s < muestras.length; s++)
    for (let r = s + 1; r < muestras.length; r++) {
      const [i, j] = [muestras[s], muestras[r]]
      if (Math.hypot(enB[j][0] - enB[i][0], enB[j][1] - enB[i][1]) > 8 * tolerancia) parejasDeB.push([i, j])
    }

  let mejor: { coseno: number; seno: number; tx: number; ty: number; dentro: number } | null = null
  const contar = (coseno: number, seno: number, tx: number, ty: number, techo: number) => {
    let dentro = 0
    for (let i = 0; i < nb; i++) {
      const [x, y] = enB[i]
      if (vecino(coseno * x - seno * y + tx, seno * x + coseno * y + ty) >= 0) dentro++
      // Si ni acertando todos los que faltan supera al mejor, no hace falta seguir.
      else if (dentro + (nb - 1 - i) <= techo) return dentro
    }
    return dentro
  }
  fuera: for (const [i, j] of parejasDeB) {
    const d = Math.hypot(enB[j][0] - enB[i][0], enB[j][1] - enB[i][1])
    const anguloB = Math.atan2(enB[j][1] - enB[i][1], enB[j][0] - enB[i][0])
    for (let p = desde(d - tolerancia); p < parejas.orden.length && parejas.d[parejas.orden[p]] <= d + tolerancia; p++) {
      const q = parejas.orden[p]
      for (const [k, l] of [
        [parejas.i[q], parejas.j[q]],
        [parejas.j[q], parejas.i[q]],
      ]) {
        const giro = Math.atan2(enA[l][1] - enA[k][1], enA[l][0] - enA[k][0]) - anguloB
        const coseno = Math.cos(giro)
        const seno = Math.sin(giro)
        const tx = enA[k][0] - (coseno * enB[i][0] - seno * enB[i][1])
        const ty = enA[k][1] - (seno * enB[i][0] + coseno * enB[i][1])
        const dentro = contar(coseno, seno, tx, ty, mejor?.dentro ?? 0)
        if (!mejor || dentro > mejor.dentro) mejor = { coseno, seno, tx, ty, dentro }
        if (dentro === nb) break fuera
      }
    }
  }
  const minimo = Math.max(4, Math.ceil(0.3 * Math.min(na, nb)))
  if (!mejor || mejor.dentro < minimo) return null

  // Las parejas de vértices que coinciden, en el espacio: con ellas se afina el movimiento entero.
  const deB: THREE.Vector3[] = []
  const deA: THREE.Vector3[] = []
  enB.forEach(([x, y], i) => {
    const k = vecino(mejor.coseno * x - mejor.seno * y + mejor.tx, mejor.seno * x + mejor.coseno * y + mejor.ty)
    if (k < 0) return
    deB.push(b.vertices[i])
    deA.push(a.vertices[k])
  })
  const matriz = mejorMovimiento(deB, deA)
  let suma = 0
  const p = new THREE.Vector3()
  deB.forEach((q, i) => (suma += p.copy(q).applyMatrix4(matriz).distanceToSquared(deA[i])))
  return { matriz, vertices: deB.length, errorMm: Math.sqrt(suma / deB.length) / unidad }
}

/**
 * El movimiento rígido que mejor lleva `origen` sobre `destino`, por mínimos cuadrados (Horn, 1987: el giro es el
 * autovector del mayor autovalor de una matriz de 4 × 4).
 *
 * Se elige Horn y no el de la descomposición en valores singulares porque da siempre un giro y nunca una reflexión, y
 * los vértices de una tapa están todos en un plano: con ellos la otra vía tiene que adivinar el signo de la normal.
 */
export function mejorMovimiento(origen: THREE.Vector3[], destino: THREE.Vector3[]): THREE.Matrix4 {
  const co = origen.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(origen.length)
  const cd = destino.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(destino.length)
  let sxx = 0, sxy = 0, sxz = 0, syx = 0, syy = 0, syz = 0, szx = 0, szy = 0, szz = 0
  for (let i = 0; i < origen.length; i++) {
    const ox = origen[i].x - co.x, oy = origen[i].y - co.y, oz = origen[i].z - co.z
    const dx = destino[i].x - cd.x, dy = destino[i].y - cd.y, dz = destino[i].z - cd.z
    sxx += ox * dx; sxy += ox * dy; sxz += ox * dz
    syx += oy * dx; syy += oy * dy; syz += oy * dz
    szx += oz * dx; szy += oz * dy; szz += oz * dz
  }
  const n = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ]
  const [w, x, y, z] = mayorAutovector(n)
  const giro = new THREE.Quaternion(x, y, z, w).normalize()
  const traslacion = cd.clone().sub(co.clone().applyQuaternion(giro))
  return new THREE.Matrix4().compose(traslacion, giro, new THREE.Vector3(1, 1, 1))
}

/** Jacobi cíclico sobre una matriz simétrica pequeña: el autovector del mayor autovalor. */
function mayorAutovector(entrada: number[][]): number[] {
  const n = entrada.length
  const a = entrada.map((fila) => [...fila])
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  for (let barrido = 0; barrido < 60; barrido++) {
    let fuera = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) fuera += a[p][q] * a[p][q]
    if (fuera < 1e-30) break
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = a[k][p]
          const akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k]
          const aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p]
          const vkq = v[k][q]
          v[k][p] = c * vkp - s * vkq
          v[k][q] = s * vkp + c * vkq
        }
      }
  }
  let mayor = 0
  for (let i = 1; i < n; i++) if (a[i][i] > a[mayor][mayor]) mayor = i
  return v.map((fila) => fila[mayor])
}

// ------------------------------------------------------------ todo el hueso

/**
 * Dónde va cada trozo para que el hueso quede reducido.
 *
 * Se encajan todas las parejas de trozos por sus tapas y se arma, desde el ancla, el árbol de los mejores encajes —los
 * de más vértices coincidentes—: cada trozo se coloca sobre el que ya está colocado, y su movimiento es el de ese trozo
 * seguido del encaje. Un hueso partido en una cadena de cortes no tiene ciclos, y si los tuviera (un trozo que toca a
 * otros dos) el árbol se queda con el encaje más firme de cada uno en vez de promediar dos que dirían cosas distintas.
 *
 * Cada grupo de trozos que encajan entre sí es un hueso, con su propia ancla: si en el mismo modelo se partieron la
 * tibia y el peroné, cada uno se reduce sobre su trozo más grande, sin pegarlos entre sí.
 */
export function reducirPorLasCarasDeCorte(trozos: TrozoParaReducir[], opciones: OpcionesDeLaReduccion): ResultadoDeLaReduccion {
  const unidad = 1 / (opciones.milimetrosPorUnidad > 0 ? opciones.milimetrosPorUnidad : 1000)
  const tolerancia = (opciones.toleranciaMm ?? TOLERANCIA_MM) * unidad
  const analizados = trozos.map((t) => analizar(t, unidad)).filter((t) => t.tapas.length > 0)

  // El mejor encaje de cada pareja de trozos: el de la pareja de tapas con más vértices en común.
  const encajes: { a: number; b: number; encaje: Encaje }[] = []
  for (let i = 0; i < analizados.length; i++)
    for (let j = i + 1; j < analizados.length; j++) {
      let mejor: Encaje | null = null
      for (const ta of analizados[i].tapas)
        for (const tb of analizados[j].tapas) {
          const e = encajarTapas(ta, tb, tolerancia, unidad)
          if (e && (!mejor || e.vertices > mejor.vertices)) mejor = e
        }
      if (mejor) encajes.push({ a: i, b: j, encaje: mejor })
    }

  // Los grupos que encajan entre sí: cada uno es un hueso.
  const raiz = analizados.map((_, i) => i)
  const buscar = (i: number): number => (raiz[i] === i ? i : (raiz[i] = buscar(raiz[i])))
  for (const { a, b } of encajes) raiz[buscar(a)] = buscar(b)
  const grupos = new Map<number, number[]>()
  analizados.forEach((_, i) => {
    const r = buscar(i)
    grupos.set(r, [...(grupos.get(r) ?? []), i])
  })

  const resultado: ResultadoDeLaReduccion = { anclas: [], colocados: [], sueltos: [] }
  for (const miembros of grupos.values()) {
    if (miembros.length < 2) {
      // El resto del esqueleto, fundido en un objeto, trae alguna cara plana —una rodilla recortada, un hueso del pie
      // cortado por el marco— sin ser un trozo de la fractura. Un trozo de verdad es tapa en buena parte; avisar del
      // esqueleto como «trozo sin pareja» solo confundía.
      const t = analizados[miembros[0]]
      if (t.areaDeTapas >= PARTE_DE_TAPA * t.area) resultado.sueltos.push(t.nodo)
      continue
    }
    const pedida = miembros.find((i) => analizados[i].nodo === opciones.ancla)
    const ancla = pedida ?? miembros.reduce((m, i) => (analizados[i].area > analizados[m].area ? i : m), miembros[0])
    resultado.anclas.push(analizados[ancla].nodo)
    const colocado = new Map<number, THREE.Matrix4>([[ancla, new THREE.Matrix4()]])
    while (colocado.size < miembros.length) {
      let elegido: { desde: number; hacia: number; matriz: THREE.Matrix4; encaje: Encaje } | null = null
      for (const { a, b, encaje } of encajes) {
        const conA = colocado.has(a)
        const conB = colocado.has(b)
        if (conA === conB) continue
        if (elegido && encaje.vertices <= elegido.encaje.vertices) continue
        // El encaje lleva `b` junto a `a`; al revés, es su inverso.
        elegido = conA
          ? { desde: a, hacia: b, matriz: encaje.matriz, encaje }
          : { desde: b, hacia: a, matriz: encaje.matriz.clone().invert(), encaje }
      }
      if (!elegido) break
      const matriz = colocado.get(elegido.desde)!.clone().multiply(elegido.matriz)
      colocado.set(elegido.hacia, matriz)
      const trozo = analizados[elegido.hacia]
      const transformacion = transformacionDe(matriz)
      resultado.colocados.push({
        nodo: trozo.nodo,
        transformacion,
        sobre: analizados[elegido.desde].nodo,
        vertices: elegido.encaje.vertices,
        errorMm: elegido.encaje.errorMm,
        desplazamientoMm: trozo.centro.clone().applyMatrix4(matriz).distanceTo(trozo.centro) / unidad,
        giroGrados: gradosDelGiro(transformacion),
      })
    }
  }
  return resultado
}

/** Si un movimiento guardado es, en la práctica, quedarse quieto: no merece guardarse. */
export function esCasiIdentidad(t: TransformacionRigida, milimetrosPorUnidad: number): boolean {
  return Math.hypot(t.x, t.y, t.z) * milimetrosPorUnidad < QUIETO_MM && gradosDelGiro(t) < QUIETO_GRADOS
}

/** Si lo colocado se queda donde estaba: entonces no hay nada que guardar ni que mover. */
export const yaEstaEnSuSitio = (c: Pick<TrozoColocado, 'desplazamientoMm' | 'giroGrados'>) =>
  c.desplazamientoMm < QUIETO_MM && c.giroGrados < QUIETO_GRADOS
