/**
 * La lectura clínica de un fragmento, y cómo se escribe (D-160).
 *
 * Está aparte de `manipular.ts` para que el taller pueda mostrarla sin traer
 * three: aquí no hay ni un vector, solo cifras y las palabras con que se
 * dicen. El taller importa de forma estática lo que no pesa, y trae el visor, que
 * sí lo necesita, con `dynamic()`.
 */

import { porcentajeDelDiametro } from '@/lib/reduccion'

/**
 * Lo que un traumatólogo lee de un fragmento distal respecto del proximal. Los
 * desplazamientos en milímetros y los ángulos en grados, con el signo escrito
 * en la propia cifra: lateral y valgo, anterior y recurvatum, rotación externa y
 * diástasis son positivos; medial, varo, posterior, antecurvatum, rotación
 * interna y acortamiento, negativos.
 */
export interface LecturaClinica {
  lateral: number
  anteroposterior: number
  /** Más: los fragmentos se separan (diástasis). Menos: cabalgan (acortamiento). */
  axial: number
  /** Más: el extremo distal se va hacia fuera (valgo). Menos: hacia dentro (varo). */
  valgo: number
  /** Más: el extremo distal se va hacia delante (recurvatum). Menos: hacia atrás (antecurvatum). */
  recurvatum: number
  /** Más: la cara anterior del distal gira hacia fuera (rotación externa). */
  rotacion: number
  /**
   * El ancho del hueso en el foco, de lado a lado y de delante atrás, en
   * milímetros: con él, el desplazamiento se escribe también en % del diámetro
   * (Q-010, D-258). Es el de la tapa del proximal; sin tapa —un trozo de marco—
   * no se sabe, y van solo los milímetros.
   */
  anchoLateralMm?: number | null
  anchoAnteroposteriorMm?: number | null
}

export const LECTURA_NULA: Readonly<LecturaClinica> = {
  lateral: 0,
  anteroposterior: 0,
  axial: 0,
  valgo: 0,
  recurvatum: 0,
  rotacion: 0,
}

/** Un vector y un cuaternión `[x, y, z, w]` como listas: lo justo para que este archivo siga sin traer three. */
export type VectorClinico = readonly [number, number, number]
export type CuaternionClinico = readonly [number, number, number, number]

/**
 * Los ejes del hueso **en el marco en que se mide**: el largo de proximal a distal, delante y fuera (lateral en su
 * lado). Son los de `EjesDeUnHueso`, pero ya girados como esté el trozo de referencia: medido contra unos ejes que no
 * son los del proximal, un varo puro se lee con parte de recurvatum.
 */
export interface EjesClinicos {
  largo: VectorClinico
  delante: VectorClinico
  fuera: VectorClinico
}

const punto = (a: VectorClinico, b: VectorClinico) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unitario = (v: VectorClinico): VectorClinico => {
  const largo = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / largo, v[1] / largo, v[2] / largo]
}
const cruz = (a: VectorClinico, b: VectorClinico): VectorClinico => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** Gira un vector por un cuaternión unitario: v' = v + w·t + q×t, con t = 2·(q×v). */
function girarVector(v: VectorClinico, q: CuaternionClinico): VectorClinico {
  const [qx, qy, qz, qw] = q
  const tx = 2 * (qy * v[2] - qz * v[1])
  const ty = 2 * (qz * v[0] - qx * v[2])
  const tz = 2 * (qx * v[1] - qy * v[0])
  return [v[0] + qw * tx + (qy * tz - qz * ty), v[1] + qw * ty + (qz * tx - qx * tz), v[2] + qw * tz + (qx * ty - qy * tx)]
}

function cuaternionUnitario(q: CuaternionClinico): CuaternionClinico {
  const largo = Math.hypot(q[0], q[1], q[2], q[3])
  return largo > 0 ? [q[0] / largo, q[1] / largo, q[2] / largo, q[3] / largo] : [0, 0, 0, 1]
}

const aGrados = (r: number) => (r * 180) / Math.PI

/** Un ángulo en (−180°, 180°]. */
function normalizarGrados(g: number): number {
  const v = (((g % 360) + 540) % 360) - 180
  return v === -180 ? 180 : v
}

/** Cuánto gira un cuaternión, en grados y por el camino más corto: la angulación total, sin pasar por Euler. */
export function anguloDelGiro(q: CuaternionClinico): number {
  const w = cuaternionUnitario(q)[3]
  return aGrados(2 * Math.acos(Math.min(1, Math.abs(w))))
}

/**
 * La lectura clínica de un desvío: dónde está el foco del trozo respecto de donde debería y cuánto ha girado, en los
 * planos con que se lee una radiografía (D-303).
 *
 * Es **la** cuenta: la usan el taller (`leerReduccion`) y la consola (`lecturaDelFragmento` del lienzo), y antes eran
 * dos. La consola restaba ángulos de Euler eje por eje (`estadoDelFragmento`), que solo da el giro de verdad si el
 * trozo empieza sin girar —y desde P-008 E5 puede empezar girado, porque se exporta ya desplazado—, y sumaba los tres en
 * una sola «angulación» que no decía si era varo, recurvatum o rotación. Un tope de 5° valía igual para los tres
 * planos, cuando en una tibia se aceptan 5° de varo y 10° de recurvatum.
 *
 * `desvio.giro` es el giro que lleva el trozo de donde debería estar a donde está, en el marco de `ejes`;
 * `desvio.separacionMm`, cuánto se ha ido su foco, en milímetros y en ese mismo marco.
 *
 * La lectura es siempre la del **distal respecto del proximal**, que es como se escribe en la ficha. Si el trozo que
 * se mueve es el proximal (`seMueve`), el desvío se invierte antes de leerlo: el proximal que gira 10° hacia dentro deja
 * al distal, visto desde él, 10° hacia fuera.
 *
 * Las cifras salen de dónde apunta el eje largo después del giro (varo o valgo en el plano coronal, recurvatum o
 * antecurvatum en el sagital) y de la torsión sobre ese eje (la rotación). Ninguna pasa por ángulos de Euler, así que no
 * dependen del orden de los giros ni se bloquean con una torsión grande. La rotación se cuenta hacia fuera del cuerpo en
 * cada lado: el sentido de la mano derecha sobre el largo es externo en un lado e interno en el otro, y la terna de ejes
 * ya dice de qué lado es.
 */
export function lecturaDelDesvio(
  desvio: { giro: CuaternionClinico; separacionMm: VectorClinico },
  ejes: EjesClinicos,
  seMueve: 'distal' | 'proximal' = 'distal',
): LecturaClinica {
  let q = cuaternionUnitario(desvio.giro)
  let s = desvio.separacionMm
  if (seMueve === 'proximal') {
    // Si el proximal se movió con (q, s) alrededor del foco, el distal visto desde él está movido con la inversa:
    // q⁻¹ y −q⁻¹·s.
    q = [-q[0], -q[1], -q[2], q[3]]
    const girada = girarVector(s, q)
    s = [-girada[0], -girada[1], -girada[2]]
  }
  const largo = unitario(ejes.largo)
  const delante = unitario(ejes.delante)
  const fuera = unitario(ejes.fuera)
  const apunta = girarVector(largo, q)
  // La torsión sobre el largo: la parte del giro que no cambia hacia dónde apunta el eje.
  const torsion = 2 * Math.atan2(q[0] * largo[0] + q[1] * largo[1] + q[2] * largo[2], q[3])
  const signoDelLado = Math.sign(punto(cruz(largo, delante), fuera)) || 1
  return {
    lateral: punto(s, fuera),
    anteroposterior: punto(s, delante),
    axial: punto(s, largo),
    valgo: aGrados(Math.atan2(punto(apunta, fuera), punto(apunta, largo))),
    recurvatum: aGrados(Math.atan2(punto(apunta, delante), punto(apunta, largo))),
    rotacion: normalizarGrados(aGrados(torsion)) * signoDelLado,
  }
}


/** Una cifra como se lee en español: coma decimal, sin ceros de más. */
export function cifra(n: number): string {
  const abs = Math.abs(n)
  const redondeada = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10
  return String(redondeada).replace('.', ',')
}

/** Por debajo de esto, una cifra no se escribe: es ruido de un arrastre que acaba de empezar. */
const MINIMO_QUE_SE_LEE = 0.5

/**
 * La lectura en una línea, en las palabras de la ficha: «8 mm lateral (35 % del
 * diámetro) · 10° varo». Solo lo que pasa de medio milímetro o medio grado. Si
 * no hay nada que leer, `null`: el fragmento está en su sitio.
 *
 * Como la pidió Cristóbal (Q-010, D-258): varo y valgo se siguen leyendo por el
 * fragmento distal; el plano sagital dice además dónde queda el ápice, que es lo
 * que se ve en la radiografía lateral y lo que evita leer «antecurvatum» al
 * revés; y el desplazamiento de través va también en % del diámetro. La
 * diástasis no lleva %: a lo largo, el hueso no tiene diámetro.
 */
export function describirLectura(lectura: LecturaClinica, opciones: { conLado?: boolean } = {}): string | null {
  // Sin saber de qué lado es el hueso, lateral y medial, varo y valgo, y rotación externa e interna pueden salir al
  // revés (D-303): se dicen entonces sin el sentido, con el plano. Delante, detrás y el eje largo no dependen del lado.
  const conLado = opciones.conLado !== false
  const partes: string[] = []
  const mm = (valor: number, mas: string, menos: string, ancho?: number | null) => {
    if (Math.abs(valor) < MINIMO_QUE_SE_LEE) return
    const porcentaje = porcentajeDelDiametro(valor, ancho)
    partes.push(`${cifra(valor)} mm ${valor > 0 ? mas : menos}${porcentaje === null ? '' : ` (${porcentaje} % del diámetro)`}`)
  }
  const grados = (valor: number, mas: string, menos: string) => {
    if (Math.abs(valor) >= MINIMO_QUE_SE_LEE) partes.push(`${cifra(valor)}° ${valor > 0 ? mas : menos}`)
  }
  if (conLado) mm(lectura.lateral, 'lateral', 'medial', lectura.anchoLateralMm)
  else mm(lectura.lateral, 'de través (lado sin saber)', 'de través (lado sin saber)', lectura.anchoLateralMm)
  mm(lectura.anteroposterior, 'anterior', 'posterior', lectura.anchoAnteroposteriorMm)
  mm(lectura.axial, 'de diástasis', 'de acortamiento')
  if (conLado) grados(lectura.valgo, 'valgo', 'varo')
  else grados(lectura.valgo, 'en el plano coronal', 'en el plano coronal')
  grados(lectura.recurvatum, 'recurvatum (ápice posterior)', 'antecurvatum (ápice anterior)')
  if (conLado) grados(lectura.rotacion, 'de rotación externa', 'de rotación interna')
  else grados(lectura.rotacion, 'de rotación', 'de rotación')
  return partes.length > 0 ? partes.join(' · ') : null
}
