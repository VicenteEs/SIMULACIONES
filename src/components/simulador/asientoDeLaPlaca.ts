import * as THREE from 'three'
import { ATRIBUTO_DEL_CANAL, marcarElCanal } from '@/atlas/canalDeLaGeometria'

/**
 * El asiento de la placa sobre el hueso, como un sólido sobre otro (P-009). Pedido del dueño, 2026-11-04: «que la
 * postura de las placas sea más realista, que interactúen como si fuera sólido con sólido y no se sobrepongan o
 * atraviesen, que se coloque recto en el hueso como si de verdad afirmara esos dos fragmentos».
 *
 * Antes la placa se apoyaba en el punto del clic con la normal del triángulo que tocaba, y al moverla se miraban tres
 * rayos a lo largo del eje del mundo. Entre esos tres puntos, y a lo ancho de la placa, el hueso podía quedar por
 * encima de la cara de abajo: con la fractura sin reducir la placa se metía 9,5 mm en el fragmento desplazado, y
 * angulada 30° quedaba con el 43 % de su cara en el aire (las capturas de «antes» de P-009). Ahora:
 *
 * - El hueso es una **nube de puntos de su superficie**, uno cada milímetro y medio, sacada una vez de cada malla. Con
 *   solo los vértices no basta: los triángulos de un modelo de atlas miden varios milímetros, y la superficie entre
 *   ellos puede quedar por encima de la placa.
 * - La placa es **un sólido rígido**. Se busca cuánto cabecea a lo largo y cuánto se ladea a lo ancho para quedar más
 *   pegada al hueso, y en esa postura se la sube hasta que el punto más alto del hueso bajo su huella toca su cara de
 *   abajo. No lo atraviesa en ningún punto por construcción, y no por haber acertado con unos pocos rayos.
 * - El largo va **por el eje del hueso**, sacado de los puntos del trozo donde se apoya, y no por un eje del mundo: la
 *   pierna de un atlas viene girada unos grados.
 * - Se sabe **qué trozo sostiene cada parte de la placa**. Una placa sobre una fractura sin reducir solo toca un
 *   fragmento, y eso es lo que tiene que ver quien opera, no una placa metida dentro del otro.
 */

/** Cada cuánto se toma un punto de la superficie del hueso, en milímetros. */
export const PASO_DE_LA_NUBE_MM = 1.5

/**
 * Lo que queda la cara de abajo por encima del punto más alto del hueso, en milímetros. Es la misma holgura con que se
 * apoyaba antes: sin ella las dos superficies se pelean en la pantalla y la placa parpadea con el hueso.
 */
export const HOLGURA_DEL_ASIENTO_MM = 0.2

/** A cuánto o menos del hueso una parte de la placa cuenta como apoyada, en milímetros. */
export const CONTACTO_MM = 0.5

/**
 * Cuánto se deja cabecear la placa a lo largo y ladear a lo ancho, en grados, desde la normal del hueso en el punto de
 * apoyo. Una diáfisis no pide más: una cara que se inclinara más que esto no es la cara en que se apoyó.
 */
const CABECEO_MAXIMO = 8
const LADEO_MAXIMO = 24

/** La nube de una malla, en sus coordenadas: se calcula una vez por geometría. */
interface NubeLocal {
  paso: number
  posiciones: Float32Array
  normales: Float32Array
  /** El área que representa cada punto: la de su triángulo entre los puntos que se tomaron de él. */
  areas: Float32Array
}

const NUBES = new WeakMap<THREE.BufferGeometry, NubeLocal>()

/** La marca del canal medular de la geometría (`aCanal`), calculándola si nadie la puso todavía; `null` si no tiene. */
function canalDeLaMalla(geometria: THREE.BufferGeometry): ArrayLike<number> | null {
  if (!marcarElCanal(geometria)) return null
  return (geometria.getAttribute(ATRIBUTO_DEL_CANAL) as THREE.BufferAttribute).array
}

/**
 * La superficie de una geometría como puntos cada `paso` (en sus unidades), con la normal de su triángulo. Se recorre
 * cada triángulo desde un vértice, a pasos a lo largo de sus dos lados: un triángulo largo y estrecho —los de un
 * cilindro de un solo tramo, o los de un hueso diezmado— no se llena de puntos a lo ancho que no hacen falta.
 */
export function nubeDeLaGeometria(geometria: THREE.BufferGeometry, paso: number): NubeLocal {
  const guardada = NUBES.get(geometria)
  if (guardada && Math.abs(guardada.paso - paso) <= paso * 0.25) return guardada
  const pos = geometria.getAttribute('position') as THREE.BufferAttribute | undefined
  const posiciones: number[] = []
  const normales: number[] = []
  const areas: number[] = []
  if (pos) {
    const indice = geometria.getIndex()
    const triangulos = Math.floor((indice ? indice.count : pos.count) / 3)
    // La pared del canal medular (D-336) no es donde apoya la placa: con ella, la normal media de un sitio y el eje del
    // hueso cerca de él mezclarían caras que miran hacia dentro del hueso.
    const delCanal = canalDeLaMalla(geometria)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const ab = new THREE.Vector3()
    const ac = new THREE.Vector3()
    const n = new THREE.Vector3()
    for (let t = 0; t < triangulos; t++) {
      if (delCanal && delCanal[indice ? indice.getX(3 * t) : 3 * t]) continue
      a.fromBufferAttribute(pos, indice ? indice.getX(3 * t) : 3 * t)
      b.fromBufferAttribute(pos, indice ? indice.getX(3 * t + 1) : 3 * t + 1)
      c.fromBufferAttribute(pos, indice ? indice.getX(3 * t + 2) : 3 * t + 2)
      ab.subVectors(b, a)
      ac.subVectors(c, a)
      n.crossVectors(ab, ac)
      const doble = n.length()
      if (!(doble > 1e-20)) continue
      n.divideScalar(doble)
      const m = Math.max(1, Math.ceil(ab.length() / paso))
      const k = Math.max(1, Math.ceil(ac.length() / paso))
      const antes = areas.length
      for (let i = 0; i <= m; i++) {
        for (let j = 0; j <= k; j++) {
          const u = i / m
          const v = j / k
          if (u + v > 1 + 1e-9) break
          posiciones.push(a.x + u * ab.x + v * ac.x, a.y + u * ab.y + v * ac.y, a.z + u * ab.z + v * ac.z)
          normales.push(n.x, n.y, n.z)
          areas.push(0)
        }
      }
      // Cada punto vale el área de su triángulo repartida entre los suyos: la media de las normales pesa la superficie,
      // y no cuántos puntos le tocaron a cada triángulo, que depende de por qué vértice se empezó a recorrerlo.
      const tomados = areas.length - antes
      for (let t2 = antes; t2 < areas.length; t2++) areas[t2] = doble / 2 / tomados
    }
  }
  const nube = {
    paso,
    posiciones: new Float32Array(posiciones),
    normales: new Float32Array(normales),
    areas: new Float32Array(areas),
  }
  NUBES.set(geometria, nube)
  return nube
}

/** Los puntos de la superficie de los huesos cerca de un sitio, ya en el mundo, con su normal y de qué malla son. */
export interface PuntosDelHueso {
  posiciones: Float32Array
  normales: Float32Array
  /** El área de superficie que representa cada punto, en unidades del mundo al cuadrado. */
  areas: Float32Array
  /** El índice en `mallas` del trozo de cada punto. */
  malla: Uint16Array
  cantidad: number
  mallas: THREE.Mesh[]
}

/**
 * Los puntos de los huesos a menos de `radio` (en unidades del mundo) de `centro`. Solo se mira la nube de las mallas
 * cuya caja llega hasta ahí: el fémur y los huesos del pie no cuestan nada al asentar una placa en la tibia.
 */
export function puntosDelHuesoCerca(
  mallas: readonly THREE.Mesh[],
  centro: THREE.Vector3,
  radio: number,
  milimetrosPorUnidad: number,
): PuntosDelHueso {
  const posiciones: number[] = []
  const normales: number[] = []
  const areas: number[] = []
  const deMalla: number[] = []
  const usadas: THREE.Mesh[] = []
  const caja = new THREE.Box3()
  const escala = new THREE.Vector3()
  const inversa = new THREE.Matrix4()
  const local = new THREE.Vector3()
  for (const malla of mallas) {
    const geometria = malla.geometry
    if (!geometria?.getAttribute('position')) continue
    malla.updateMatrixWorld(true)
    if (!geometria.boundingBox) geometria.computeBoundingBox()
    caja.copy(geometria.boundingBox!).applyMatrix4(malla.matrixWorld)
    if (caja.distanceToPoint(centro) > radio) continue
    escala.setFromMatrixScale(malla.matrixWorld)
    const s = Math.abs(escala.x) || 1
    // El paso en las unidades de la malla: el modelo trae su propia escala, y el mundo la suya.
    const nube = nubeDeLaGeometria(geometria, PASO_DE_LA_NUBE_MM / (milimetrosPorUnidad || 1000) / s)
    local.copy(centro).applyMatrix4(inversa.copy(malla.matrixWorld).invert())
    const radioLocal2 = (radio / s) ** 2
    const e = malla.matrixWorld.elements
    const indice = usadas.length
    let alguno = false
    const p = nube.posiciones
    const q = nube.normales
    const s2 = s * s
    for (let i = 0; i < p.length; i += 3) {
      const dx = p[i] - local.x
      const dy = p[i + 1] - local.y
      const dz = p[i + 2] - local.z
      if (dx * dx + dy * dy + dz * dz > radioLocal2) continue
      alguno = true
      const x = p[i]
      const y = p[i + 1]
      const z = p[i + 2]
      posiciones.push(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      )
      // La normal con la parte de giro de la matriz: la escala del modelo es la misma en los tres ejes.
      const nx = e[0] * q[i] + e[4] * q[i + 1] + e[8] * q[i + 2]
      const ny = e[1] * q[i] + e[5] * q[i + 1] + e[9] * q[i + 2]
      const nz = e[2] * q[i] + e[6] * q[i + 1] + e[10] * q[i + 2]
      const largo = Math.hypot(nx, ny, nz) || 1
      normales.push(nx / largo, ny / largo, nz / largo)
      areas.push(nube.areas[i / 3] * s2)
      deMalla.push(indice)
    }
    if (alguno) usadas.push(malla)
  }
  return {
    posiciones: new Float32Array(posiciones),
    normales: new Float32Array(normales),
    areas: new Float32Array(areas),
    malla: new Uint16Array(deMalla),
    cantidad: deMalla.length,
    mallas: usadas,
  }
}

/**
 * La normal del hueso en un punto: la media de las de la superficie a menos de `radio`, en el trozo que se tocó. La de
 * un solo triángulo, la que daba el clic, puede ir veinte grados de lado en un hueso diezmado, y la placa se ladeaba
 * con ella. Se vuelve hacia `haciaFuera`.
 */
export function normalMediaCerca(
  puntos: PuntosDelHueso,
  centro: THREE.Vector3,
  radio: number,
  haciaFuera: THREE.Vector3,
  malla?: THREE.Object3D,
): THREE.Vector3 | null {
  const indice = malla ? puntos.mallas.indexOf(malla as THREE.Mesh) : -1
  const suma = new THREE.Vector3()
  const r2 = radio * radio
  for (let k = 0; k < puntos.cantidad; k++) {
    if (indice >= 0 && puntos.malla[k] !== indice) continue
    const i = 3 * k
    const dx = puntos.posiciones[i] - centro.x
    const dy = puntos.posiciones[i + 1] - centro.y
    const dz = puntos.posiciones[i + 2] - centro.z
    if (dx * dx + dy * dy + dz * dz > r2) continue
    // Solo la cara que mira hacia fuera: la cortical del otro lado, a menos de `radio` en un hueso fino, la anularía.
    const nx = puntos.normales[i]
    const ny = puntos.normales[i + 1]
    const nz = puntos.normales[i + 2]
    if (nx * haciaFuera.x + ny * haciaFuera.y + nz * haciaFuera.z <= 0) continue
    const w = puntos.areas[k]
    suma.x += nx * w
    suma.y += ny * w
    suma.z += nz * w
  }
  return suma.lengthSq() > 1e-12 ? suma.normalize() : null
}

/**
 * El eje largo del trozo donde se apoya la placa, cerca del apoyo: componentes principales de sus puntos a menos de
 * `radio`. Devuelve `null` si esos puntos no son alargados —la meseta, un fragmento pequeño— o si el eje se aparta más
 * de 30° del aproximado: entonces vale el aproximado, que es el del caso.
 */
export function ejeDelHuesoCerca(
  puntos: PuntosDelHueso,
  centro: THREE.Vector3,
  radio: number,
  aproximado: THREE.Vector3,
  malla?: THREE.Object3D,
): THREE.Vector3 | null {
  const indice = malla ? puntos.mallas.indexOf(malla as THREE.Mesh) : -1
  const r2 = radio * radio
  let n = 0
  const media = new THREE.Vector3()
  const elegidos: number[] = []
  for (let k = 0; k < puntos.cantidad; k++) {
    if (indice >= 0 && puntos.malla[k] !== indice) continue
    const i = 3 * k
    const dx = puntos.posiciones[i] - centro.x
    const dy = puntos.posiciones[i + 1] - centro.y
    const dz = puntos.posiciones[i + 2] - centro.z
    if (dx * dx + dy * dy + dz * dz > r2) continue
    elegidos.push(i)
    media.x += puntos.posiciones[i]
    media.y += puntos.posiciones[i + 1]
    media.z += puntos.posiciones[i + 2]
    n++
  }
  if (n < 20) return null
  media.divideScalar(n)
  const c = [0, 0, 0, 0, 0, 0]
  for (const i of elegidos) {
    const x = puntos.posiciones[i] - media.x
    const y = puntos.posiciones[i + 1] - media.y
    const z = puntos.posiciones[i + 2] - media.z
    c[0] += x * x
    c[1] += x * y
    c[2] += x * z
    c[3] += y * y
    c[4] += y * z
    c[5] += z * z
  }
  // Iteración de potencias desde el eje aproximado: converge al autovector dominante, que en un hueso largo es su eje.
  let v = aproximado.clone().normalize()
  for (let k = 0; k < 50; k++) {
    const w = new THREE.Vector3(
      c[0] * v.x + c[1] * v.y + c[2] * v.z,
      c[1] * v.x + c[3] * v.y + c[4] * v.z,
      c[2] * v.x + c[4] * v.y + c[5] * v.z,
    )
    if (w.lengthSq() < 1e-30) return null
    v = w.normalize()
  }
  const traza = c[0] + c[3] + c[5]
  const lambda =
    v.x * (c[0] * v.x + c[1] * v.y + c[2] * v.z) +
    v.y * (c[1] * v.x + c[3] * v.y + c[4] * v.z) +
    v.z * (c[2] * v.x + c[4] * v.y + c[5] * v.z)
  // Alargado: el eje se lleva casi toda la varianza. Un trozo de diáfisis de seis centímetros da 0,7; una meseta, 0,4.
  if (!(traza > 0) || lambda / traza < 0.6) return null
  if (v.dot(aproximado) < 0) v.negate()
  if (v.angleTo(aproximado) > Math.PI / 6) return null
  return v
}

/**
 * La cara de abajo de la placa, en celdas: cinco columnas a lo ancho y una fila cada dos milímetros a lo largo, en
 * unidades del mundo y desde el centro de esa cara. `alturas` es lo que esa cara sube o baja en cada celda respecto de
 * la recta: cero en una placa recta, y lo que dio el doblez en una que viene de la mesa de modelado.
 */
export interface CaraDeAbajo {
  columnas: number
  filas: number
  medioAncho: number
  medioLargo: number
  alturas: Float32Array
}

export function caraRecta(anchoMundo: number, largoMundo: number, milimetrosPorUnidad: number): CaraDeAbajo {
  const filas = Math.max(4, Math.round((largoMundo * milimetrosPorUnidad) / 2))
  return {
    columnas: 5,
    filas,
    medioAncho: anchoMundo / 2,
    medioLargo: largoMundo / 2,
    alturas: new Float32Array(5 * filas),
  }
}

/** En qué celda cae un punto de la cara, en las coordenadas de la placa (X a lo ancho, Z a lo largo); −1 si fuera. */
export function celdaDe(cara: CaraDeAbajo, x: number, z: number): number {
  if (Math.abs(x) > cara.medioAncho || Math.abs(z) > cara.medioLargo) return -1
  const i = Math.min(
    cara.columnas - 1,
    Math.floor(((x + cara.medioAncho) / (2 * cara.medioAncho || 1)) * cara.columnas),
  )
  const j = Math.min(cara.filas - 1, Math.floor(((z + cara.medioLargo) / (2 * cara.medioLargo || 1)) * cara.filas))
  return j * cara.columnas + i
}

/** Cómo quedó la placa: su postura y lo que toca. Las distancias, en unidades del mundo. */
export interface Asiento {
  /** La cara de arriba: el Y de la placa. */
  normal: THREE.Vector3
  /** Hacia dónde va el largo del hueso: la placa va por −Z, así que su Z es `−eje`. */
  eje: THREE.Vector3
  /** Cuánto sube el centro de la cara de abajo desde el punto de apoyo, a lo largo de `normal`. */
  altura: number
  /** La holgura de cada celda (NaN sin hueso debajo) y qué trozo tiene debajo (−1 ninguno). */
  holguras: Float32Array
  trozoDeLaCelda: Int16Array
  /** Fracciones de la cara: apoyada, y sin hueso debajo. */
  contacto: number
  sinHueso: number
  holguraMedia: number
}

const VACIO = -Infinity

/**
 * Busca la postura de la placa sobre los puntos del hueso. Parte de `normal` y `eje` (el largo, ya girado lo que pida
 * el ajuste) y prueba a cabecearla y ladearla; se queda con la que deja menos holgura media y más cara apoyada,
 * castigando la cara que queda sin hueso debajo y lo que se aparta de la normal de partida, para que entre dos casi
 * iguales gane la que se pidió. En cada postura la placa sube hasta tocar el punto más alto bajo su huella: nunca
 * queda dentro.
 *
 * Devuelve `null` si bajo la huella no hay hueso en ninguna postura.
 */
export function buscarAsiento(p: {
  puntos: PuntosDelHueso
  apoyo: THREE.Vector3
  normal: THREE.Vector3
  eje: THREE.Vector3
  cara: CaraDeAbajo
  milimetrosPorUnidad: number
}): Asiento | null {
  const unidad = 1 / (p.milimetrosPorUnidad || 1000)
  const { cara, puntos } = p
  const y0 = p.normal.clone().normalize()
  const z0 = p.eje.clone().negate().addScaledVector(y0, p.eje.dot(y0)).normalize()
  const x0 = new THREE.Vector3().crossVectors(y0, z0).normalize()
  const celdas = cara.columnas * cara.filas
  const alto = new Float64Array(celdas)
  const trozo = new Int16Array(celdas)
  const profundo = -40 * unidad
  const castigoSinHueso = 3 * unidad
  const castigoPorGrado = 0.03 * unidad
  const premioPorContacto = 1 * unidad

  // Solo los puntos que pueden caer bajo la placa en alguna de las posturas: la huella y unos milímetros alrededor.
  const margen = 6 * unidad
  const cerca: number[] = []
  for (let k = 0; k < puntos.cantidad; k++) {
    const i = 3 * k
    const rx = puntos.posiciones[i] - p.apoyo.x
    const ry = puntos.posiciones[i + 1] - p.apoyo.y
    const rz = puntos.posiciones[i + 2] - p.apoyo.z
    const x = rx * x0.x + ry * x0.y + rz * x0.z
    const y = rx * y0.x + ry * y0.y + rz * y0.z
    const z = rx * z0.x + ry * z0.y + rz * z0.z
    if (Math.abs(x) > cara.medioAncho + margen || Math.abs(z) > cara.medioLargo + margen) continue
    if (y < profundo || y > 40 * unidad) continue
    cerca.push(k)
  }
  if (cerca.length === 0) return null

  const evaluar = (cabeceo: number, ladeo: number, guardar: boolean) => {
    const ct = Math.cos(cabeceo)
    const st = Math.sin(cabeceo)
    // Cabecear: girar alrededor de X; ladear: girar alrededor del largo ya cabeceado.
    const y1 = y0.clone().multiplyScalar(ct).addScaledVector(z0, st)
    const z1 = z0.clone().multiplyScalar(ct).addScaledVector(y0, -st)
    const cf = Math.cos(ladeo)
    const sf = Math.sin(ladeo)
    const x2 = x0.clone().multiplyScalar(cf).addScaledVector(y1, sf)
    const y2 = y1.clone().multiplyScalar(cf).addScaledVector(x0, -sf)
    const z2 = z1
    alto.fill(VACIO)
    trozo.fill(-1)
    for (const k of cerca) {
      const i = 3 * k
      const rx = puntos.posiciones[i] - p.apoyo.x
      const ry = puntos.posiciones[i + 1] - p.apoyo.y
      const rz = puntos.posiciones[i + 2] - p.apoyo.z
      const y = rx * y2.x + ry * y2.y + rz * y2.z
      if (y < profundo) continue
      const c = celdaDe(cara, rx * x2.x + ry * x2.y + rz * x2.z, rx * z2.x + ry * z2.y + rz * z2.z)
      if (c < 0) continue
      if (y > alto[c]) {
        alto[c] = y
        trozo[c] = puntos.malla[k]
      }
    }
    // Lo que tiene que subir la placa: que ninguna celda de su cara quede por debajo del hueso de esa celda.
    let altura = VACIO
    for (let c = 0; c < celdas; c++) if (alto[c] !== VACIO) altura = Math.max(altura, alto[c] - cara.alturas[c])
    if (altura === VACIO) return null
    let suma = 0
    let conHueso = 0
    let apoyadas = 0
    for (let c = 0; c < celdas; c++) {
      if (alto[c] === VACIO) continue
      const h = altura + cara.alturas[c] - alto[c]
      suma += h
      conHueso++
      if (h <= CONTACTO_MM * unidad) apoyadas++
    }
    const sinHueso = 1 - conHueso / celdas
    const media = suma / conHueso
    const grados = (Math.acos(Math.min(1, Math.max(-1, y2.dot(y0)))) * 180) / Math.PI
    // Lo apoyado también cuenta. Sobre un escalón sin reducir, la placa que se mece tocando los dos fragmentos por un
    // borde y la que se apoya de lleno en uno casi empatan en holgura media (1,4 y 1,6 mm con un escalón de 3 mm); la que
    // se apoya de lleno es la que se ve en un quirófano, y la que dice la verdad: que un fragmento no está reducido.
    const nota = media - premioPorContacto * (apoyadas / celdas) + castigoSinHueso * sinHueso + castigoPorGrado * grados
    if (!guardar) return { nota }
    const holguras = new Float32Array(celdas)
    for (let c = 0; c < celdas; c++) holguras[c] = alto[c] === VACIO ? NaN : altura + cara.alturas[c] - alto[c]
    return {
      nota,
      asiento: {
        normal: y2.clone().normalize(),
        eje: z2.clone().negate().normalize(),
        altura,
        holguras,
        trozoDeLaCelda: Int16Array.from(trozo),
        contacto: apoyadas / celdas,
        sinHueso,
        holguraMedia: media,
      } satisfies Asiento,
    }
  }

  const rad = Math.PI / 180
  let mejor = { cabeceo: 0, ladeo: 0, nota: Infinity }
  for (let t = -CABECEO_MAXIMO; t <= CABECEO_MAXIMO; t += 2) {
    for (let f = -LADEO_MAXIMO; f <= LADEO_MAXIMO; f += 4) {
      const r = evaluar(t * rad, f * rad, false)
      if (r && r.nota < mejor.nota) mejor = { cabeceo: t, ladeo: f, nota: r.nota }
    }
  }
  if (!Number.isFinite(mejor.nota)) return null
  // Y se afina alrededor de la mejor, a medio paso.
  const base = { ...mejor }
  for (const dt of [-1, 0, 1]) {
    for (const df of [-2, 0, 2]) {
      if (dt === 0 && df === 0) continue
      const r = evaluar((base.cabeceo + dt) * rad, (base.ladeo + df) * rad, false)
      if (r && r.nota < mejor.nota)
        mejor = {
          cabeceo: base.cabeceo + dt,
          ladeo: base.ladeo + df,
          nota: r.nota,
        }
    }
  }
  return evaluar(mejor.cabeceo * rad, mejor.ladeo * rad, true)?.asiento ?? null
}
