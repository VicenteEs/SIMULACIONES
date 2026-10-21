/**
 * Cómo se dobla y se tuerce una placa fuera del hueso (P-005 E1, pedido del dueño: «las placas se pueden doblar, no estando en el hueso,
 * con herramientas»).
 *
 * En pabellón una placa precontorneada rara vez calza en el hueso del paciente. Se **dobla** (flexión, con el alicate de tres puntos, para
 * seguir la curvatura longitudinal), se **tuerce** (con las grifas, para seguir la torsión) y se prueba contra una plantilla de aluminio.
 * Lo que no se hace: doblar **a través de un orificio** (lo ovala y, en una LCP, estropea la rosca del bloqueo) ni doblar de ida y vuelta en el
 * mismo sitio (fatiga el metal y la placa se rompe más tarde).
 *
 * Esto es la parte que se puede probar sin lienzo: el contorno es una lista de **dobleces** (dónde, cuántos grados de flexión y de torsión) y
 * de ahí sale, integrando, el eje curvo de la placa y la transformación de cada punto del modelo. El lienzo solo la aplica a la malla.
 * Las reglas —cuánto cede la placa, qué distancia de un orificio es «sobre el orificio»— están aquí, a la vista, para que el traumatólogo las
 * corrija sin tocar nada de la escena (son una propuesta, no una norma).
 *
 * Marco de la placa, en milímetros: `u` a lo ancho, `v` en el grosor (la cara de arriba es +v) y `s` a lo largo, con `s = 0` en el centro del
 * contorno. El centro de la placa no se mueve al doblar: la placa se dobla alrededor de él.
 */

/** Un doblez: en `sMm` desde el centro, con cuánta flexión y cuánta torsión acumuladas (en grados; + es hacia la cara de arriba). */
export interface Doblez {
  sMm: number
  flexionGrados: number
  torsionGrados: number
}

/** Lo que se hizo, en el orden en que se hizo: de ahí sale la fatiga. */
export interface Maniobra {
  sMm: number
  flexionGrados: number
  torsionGrados: number
}

export interface ContornoDeLaPlaca {
  dobleces: Doblez[]
  maniobras: Maniobra[]
}

export const SIN_CONTORNO: ContornoDeLaPlaca = { dobleces: [], maniobras: [] }

/**
 * Sobre cuánto largo ocurre un doblez: un arco corto, el de las clavijas del alicate (unos 4 mm), y no una esquina. Tiene que caber en el puente entre dos
 * orificios: en las placas del catálogo van cada 13 mm, y entre orificios quedan unos 6 mm de metal sin agujero, que es donde se dobla.
 */
export const LARGO_DE_LA_FLEXION_MM = 4
/** Sobre cuánto largo se reparte una torsión: es más suave que la flexión (unos 20 mm). */
export const LARGO_DE_LA_TORSION_MM = 20
/** Dos dobleces a menos de esta distancia son el mismo sitio: se suman. */
export const MARGEN_DEL_SITIO_MM = 6
/** Lo que cede una placa en un mismo sitio antes de agrietarse, en grados. */
export const FLEXION_MAXIMA_POR_SITIO = 45
export const TORSION_MAXIMA_POR_SITIO = 40
/** Lo máximo que se puede doblar una placa entera, sumando todos los sitios (en valor absoluto). */
export const FLEXION_TOTAL_MAXIMA = 120
/** Cuánto se acerca un doblez a un orificio antes de deformarlo: el radio del orificio más un margen. */
export const RADIO_DEL_ORIFICIO_MM = 3
/** Con cuántas inversiones de sentido en un mismo sitio la placa se fatiga. */
export const INVERSIONES_QUE_FATIGAN = 2

const RAD = Math.PI / 180

const nuevoContorno = (dobleces: Doblez[], maniobras: Maniobra[]): ContornoDeLaPlaca => ({ dobleces, maniobras })

export interface ResultadoDeDoblar {
  contorno: ContornoDeLaPlaca
  /** Lo que de verdad se aplicó, que puede ser menos de lo pedido si la placa no cede más. */
  aplicado: { flexionGrados: number; torsionGrados: number }
  /** Qué decirle a quien dobla, en palabras. Vacío si no pasó nada que contar. */
  avisos: string[]
}

const acotar = (valor: number, tope: number) => Math.max(-tope, Math.min(tope, valor))

/**
 * Dobla o tuerce la placa en `sMm`. No muta el contorno que recibe.
 *
 * Si ya hay un doblez a menos de `MARGEN_DEL_SITIO_MM`, se suma a ese. Cada sitio cede hasta `FLEXION_MAXIMA_POR_SITIO` y
 * `TORSION_MAXIMA_POR_SITIO`, y la placa entera hasta `FLEXION_TOTAL_MAXIMA` de flexión sumada: más allá, no se aplica el resto
 * y el aviso lo dice.
 */
export function doblar(contorno: ContornoDeLaPlaca, sMm: number, pedido: { flexionGrados?: number; torsionGrados?: number }): ResultadoDeDoblar {
  const avisos: string[] = []
  const flexionPedida = pedido.flexionGrados ?? 0
  const torsionPedida = pedido.torsionGrados ?? 0
  const indice = contorno.dobleces.findIndex((d) => Math.abs(d.sMm - sMm) < MARGEN_DEL_SITIO_MM)
  const actual = indice >= 0 ? contorno.dobleces[indice] : { sMm, flexionGrados: 0, torsionGrados: 0 }

  let flexion = acotar(actual.flexionGrados + flexionPedida, FLEXION_MAXIMA_POR_SITIO)
  if (flexion !== actual.flexionGrados + flexionPedida) avisos.push(`La placa no cede más de ${FLEXION_MAXIMA_POR_SITIO}° en un mismo sitio: ahí se agrietaría.`)
  const torsion = acotar(actual.torsionGrados + torsionPedida, TORSION_MAXIMA_POR_SITIO)
  if (torsion !== actual.torsionGrados + torsionPedida) avisos.push(`La placa no se tuerce más de ${TORSION_MAXIMA_POR_SITIO}° en un mismo sitio.`)

  // El total de flexión de la placa entera, sin contar este sitio, más lo que quedaría en él.
  const otros = contorno.dobleces.reduce((suma, d, i) => (i === indice ? suma : suma + Math.abs(d.flexionGrados)), 0)
  if (otros + Math.abs(flexion) > FLEXION_TOTAL_MAXIMA) {
    flexion = Math.sign(flexion) * Math.max(0, FLEXION_TOTAL_MAXIMA - otros)
    avisos.push(`La placa ya está muy doblada (${FLEXION_TOTAL_MAXIMA}° entre todos los sitios): no admite más.`)
  }

  const flexionAplicada = flexion - actual.flexionGrados
  const torsionAplicada = torsion - actual.torsionGrados
  if (flexionAplicada === 0 && torsionAplicada === 0) return { contorno, aplicado: { flexionGrados: 0, torsionGrados: 0 }, avisos }

  const nuevo: Doblez = { sMm: actual.sMm, flexionGrados: flexion, torsionGrados: torsion }
  const dobleces = indice >= 0 ? contorno.dobleces.map((d, i) => (i === indice ? nuevo : d)) : [...contorno.dobleces, nuevo]
  // Un sitio que vuelve a cero se quita: no es un doblez, es una placa recta.
  const sinCeros = dobleces.filter((d) => d.flexionGrados !== 0 || d.torsionGrados !== 0)
  const maniobras = [...contorno.maniobras, { sMm: actual.sMm, flexionGrados: flexionAplicada, torsionGrados: torsionAplicada }]
  return { contorno: nuevoContorno(sinCeros, maniobras), aplicado: { flexionGrados: flexionAplicada, torsionGrados: torsionAplicada }, avisos }
}

/** Deshace la última maniobra: vuelve a quitar lo que sumó. Devuelve el mismo contorno si no hay nada que deshacer. */
export function deshacerLaUltima(contorno: ContornoDeLaPlaca): ContornoDeLaPlaca {
  const ultima = contorno.maniobras[contorno.maniobras.length - 1]
  if (!ultima) return contorno
  const indice = contorno.dobleces.findIndex((d) => Math.abs(d.sMm - ultima.sMm) < MARGEN_DEL_SITIO_MM)
  const maniobras = contorno.maniobras.slice(0, -1)
  if (indice < 0) return nuevoContorno(contorno.dobleces, maniobras)
  const d = contorno.dobleces[indice]
  const revertido: Doblez = { sMm: d.sMm, flexionGrados: d.flexionGrados - ultima.flexionGrados, torsionGrados: d.torsionGrados - ultima.torsionGrados }
  const dobleces = contorno.dobleces.map((x, i) => (i === indice ? revertido : x)).filter((x) => x.flexionGrados !== 0 || x.torsionGrados !== 0)
  return nuevoContorno(dobleces, maniobras)
}

/** Cuántas veces cambió de sentido la flexión en el sitio de `sMm` (más/menos/más son dos inversiones). */
export function inversionesEn(contorno: ContornoDeLaPlaca, sMm: number): number {
  let ultimo = 0
  let inversiones = 0
  for (const m of contorno.maniobras) {
    if (Math.abs(m.sMm - sMm) >= MARGEN_DEL_SITIO_MM || m.flexionGrados === 0) continue
    const signo = Math.sign(m.flexionGrados)
    if (ultimo !== 0 && signo !== ultimo) inversiones += 1
    ultimo = signo
  }
  return inversiones
}

/** Los sitios donde la placa se fatigó, por la posición de su doblez. */
export function sitiosFatigados(contorno: ContornoDeLaPlaca): number[] {
  const vistos: number[] = []
  for (const m of contorno.maniobras) {
    if (vistos.some((s) => Math.abs(s - m.sMm) < MARGEN_DEL_SITIO_MM)) continue
    if (inversionesEn(contorno, m.sMm) >= INVERSIONES_QUE_FATIGAN) vistos.push(m.sMm)
  }
  return vistos
}

/**
 * Qué orificios quedan deformados por los dobleces del contorno. Un orificio está **sobre** un doblez cuando su centro cae dentro de la
 * zona que el doblez dobla (la mitad del largo de la flexión o de la torsión) más el radio del orificio.
 */
export function orificiosDeformados(contorno: ContornoDeLaPlaca, orificiosSMm: readonly number[]): number[] {
  const malos: number[] = []
  orificiosSMm.forEach((s, i) => {
    const sobre = contorno.dobleces.some((d) => {
      const alcanceFlexion = d.flexionGrados !== 0 ? LARGO_DE_LA_FLEXION_MM / 2 + RADIO_DEL_ORIFICIO_MM : -Infinity
      const alcanceTorsion = d.torsionGrados !== 0 ? LARGO_DE_LA_TORSION_MM / 2 + RADIO_DEL_ORIFICIO_MM : -Infinity
      return Math.abs(s - d.sMm) < Math.max(alcanceFlexion, alcanceTorsion)
    })
    if (sobre) malos.push(i)
  })
  return malos
}

/** El orificio (índice) sobre el que caería un doblez en `sMm`, o `null` si cae entre orificios: lo que se avisa **antes** de doblar. */
export function orificioBajoElDoblez(orificiosSMm: readonly number[], sMm: number, soloTorsion = false): number | null {
  const alcance = (soloTorsion ? LARGO_DE_LA_TORSION_MM : LARGO_DE_LA_FLEXION_MM) / 2 + RADIO_DEL_ORIFICIO_MM
  let mejor: number | null = null
  let mejorDistancia = Infinity
  orificiosSMm.forEach((s, i) => {
    const d = Math.abs(s - sMm)
    if (d < alcance && d < mejorDistancia) {
      mejor = i
      mejorDistancia = d
    }
  })
  return mejor
}

// ------------------------------------------------------------------------------------------------ geometría

type Cuaternion = [number, number, number, number]
type Vector = [number, number, number]

const IDENTIDAD: Cuaternion = [0, 0, 0, 1]

function multiplicar(a: Cuaternion, b: Cuaternion): Cuaternion {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

function normalizar(q: Cuaternion): Cuaternion {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]
}

function girar(q: Cuaternion, v: Vector): Vector {
  const [x, y, z, w] = q
  const [vx, vy, vz] = v
  // v' = v + 2w(q × v) + 2 q × (q × v)
  const tx = 2 * (y * vz - z * vy)
  const ty = 2 * (z * vx - x * vz)
  const tz = 2 * (x * vy - y * vx)
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)]
}

const sobreX = (rad: number): Cuaternion => [Math.sin(rad / 2), 0, 0, Math.cos(rad / 2)]
const sobreZ = (rad: number): Cuaternion => [0, 0, Math.sin(rad / 2), Math.cos(rad / 2)]

/** Cuánto vale la curvatura de la flexión y la de la torsión (rad/mm) en `s`, sumando los dobleces que lo cubren. */
function curvaturas(dobleces: readonly Doblez[], s: number): { flexion: number; torsion: number } {
  let flexion = 0
  let torsion = 0
  for (const d of dobleces) {
    if (d.flexionGrados !== 0 && Math.abs(s - d.sMm) <= LARGO_DE_LA_FLEXION_MM / 2) flexion += (d.flexionGrados * RAD) / LARGO_DE_LA_FLEXION_MM
    if (d.torsionGrados !== 0 && Math.abs(s - d.sMm) <= LARGO_DE_LA_TORSION_MM / 2) torsion += (d.torsionGrados * RAD) / LARGO_DE_LA_TORSION_MM
  }
  return { flexion, torsion }
}

const PASO_MM = 0.5

interface Marco {
  s: number
  p: Vector
  q: Cuaternion
}

/**
 * El eje curvo de la placa y su marco en cada punto, muestreado cada medio milímetro desde `−mitadMm` hasta `+mitadMm`, con el centro (`s = 0`) fijo.
 * La flexión inclina la tangente hacia +v; la torsión gira el marco alrededor de la tangente.
 */
function tablaDeMarcos(dobleces: readonly Doblez[], mitadMm: number): Marco[] {
  const pasos = Math.ceil(mitadMm / PASO_MM)
  const hacia = (signo: 1 | -1): Marco[] => {
    const marcos: Marco[] = []
    let p: Vector = [0, 0, 0]
    let q: Cuaternion = IDENTIDAD
    for (let i = 1; i <= pasos; i++) {
      const sMedio = signo * (i - 0.5) * PASO_MM
      const { flexion, torsion } = curvaturas(dobleces, sMedio)
      // Hacia −s se avanza con el incremento inverso: primero se retrocede la posición, luego el giro.
      const incremento = normalizar(multiplicar(sobreX(-flexion * PASO_MM), sobreZ(torsion * PASO_MM)))
      const inverso: Cuaternion = [-incremento[0], -incremento[1], -incremento[2], incremento[3]]
      // La tangente se toma a media vía del paso (punto medio): con medio milímetro de paso el error es despreciable.
      const mitad = normalizar(multiplicar(sobreX((-flexion * PASO_MM) / 2), sobreZ((torsion * PASO_MM) / 2)))
      const mitadInversa: Cuaternion = [-mitad[0], -mitad[1], -mitad[2], mitad[3]]
      const medio = multiplicar(q, signo === 1 ? mitad : mitadInversa)
      const tangente = girar(medio, [0, 0, 1])
      p = [p[0] + signo * tangente[0] * PASO_MM, p[1] + signo * tangente[1] * PASO_MM, p[2] + signo * tangente[2] * PASO_MM]
      q = normalizar(signo === 1 ? multiplicar(q, incremento) : multiplicar(q, inverso))
      marcos.push({ s: signo * i * PASO_MM, p, q })
    }
    return marcos
  }
  return [...hacia(-1).reverse(), { s: 0, p: [0, 0, 0], q: IDENTIDAD }, ...hacia(1)]
}

function marcoEn(tabla: readonly Marco[], s: number): Marco {
  const primero = tabla[0]
  const ultimo = tabla[tabla.length - 1]
  if (s <= primero.s) {
    // Más allá del extremo, la placa sigue recta con la última tangente.
    const t = girar(primero.q, [0, 0, 1])
    const d = s - primero.s
    return { s, p: [primero.p[0] + t[0] * d, primero.p[1] + t[1] * d, primero.p[2] + t[2] * d], q: primero.q }
  }
  if (s >= ultimo.s) {
    const t = girar(ultimo.q, [0, 0, 1])
    const d = s - ultimo.s
    return { s, p: [ultimo.p[0] + t[0] * d, ultimo.p[1] + t[1] * d, ultimo.p[2] + t[2] * d], q: ultimo.q }
  }
  const i = Math.min(tabla.length - 2, Math.floor((s - primero.s) / PASO_MM))
  const a = tabla[i]
  const b = tabla[i + 1]
  const f = (s - a.s) / (b.s - a.s)
  return {
    s,
    p: [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f, a.p[2] + (b.p[2] - a.p[2]) * f],
    q: normalizar([a.q[0] + (b.q[0] - a.q[0]) * f, a.q[1] + (b.q[1] - a.q[1]) * f, a.q[2] + (b.q[2] - a.q[2]) * f, a.q[3] + (b.q[3] - a.q[3]) * f]),
  }
}

/**
 * La transformación del contorno: lleva un punto de la placa recta `(u, v, s)` —ancho, grosor y largo, en mm— a donde queda con la placa doblada.
 * `mitadMm` es lo que mide la placa hacia cada lado del centro; un poco más basta, lo que sobre se trata como recto.
 */
export function crearMapaDelContorno(contorno: ContornoDeLaPlaca, mitadMm: number): (u: number, v: number, s: number) => Vector {
  if (contorno.dobleces.length === 0) return (u, v, s) => [u, v, s]
  const tabla = tablaDeMarcos(contorno.dobleces, mitadMm)
  return (u, v, s) => {
    const m = marcoEn(tabla, s)
    const lateral = girar(m.q, [u, v, 0])
    return [m.p[0] + lateral[0], m.p[1] + lateral[1], m.p[2] + lateral[2]]
  }
}

/**
 * Cuánto se aparta el eje de la placa de la recta que une sus extremos, en mm: la «flecha» de la curva. Es lo que se lee para decir
 * «la placa tiene 4,2 mm de curva».
 */
export function flechaDeLaCurva(contorno: ContornoDeLaPlaca, mitadMm: number): number {
  if (contorno.dobleces.length === 0) return 0
  const mapa = crearMapaDelContorno(contorno, mitadMm)
  const a = mapa(0, 0, -mitadMm)
  const b = mapa(0, 0, mitadMm)
  const ab: Vector = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const largo = Math.hypot(...ab) || 1
  let maxima = 0
  for (let s = -mitadMm; s <= mitadMm; s += 1) {
    const p = mapa(0, 0, s)
    const ap: Vector = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
    const cruz: Vector = [ap[1] * ab[2] - ap[2] * ab[1], ap[2] * ab[0] - ap[0] * ab[2], ap[0] * ab[1] - ap[1] * ab[0]]
    maxima = Math.max(maxima, Math.hypot(...cruz) / largo)
  }
  return maxima
}

/** Una línea para decir cómo está la placa: «2 dobleces · flexión total 38° · flecha 4,2 mm». Vacía si está recta. */
export function textoDelContorno(contorno: ContornoDeLaPlaca, mitadMm: number): string {
  if (contorno.dobleces.length === 0) return 'Recta, sin dobleces.'
  const n = contorno.dobleces.length
  const flexion = contorno.dobleces.reduce((s, d) => s + Math.abs(d.flexionGrados), 0)
  const torsion = contorno.dobleces.reduce((s, d) => s + Math.abs(d.torsionGrados), 0)
  const coma = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',')
  const partes = [`${n} ${n === 1 ? 'doblez' : 'dobleces'}`]
  if (flexion > 0) partes.push(`flexión total ${coma(flexion)}°`)
  if (torsion > 0) partes.push(`torsión total ${coma(torsion)}°`)
  if (flexion > 0) partes.push(`flecha ${coma(flechaDeLaCurva(contorno, mitadMm))} mm`)
  return partes.join(' · ')
}
