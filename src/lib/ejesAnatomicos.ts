/**
 * Las direcciones del paciente y los rangos del ajuste de una placa (P-004 E6, pedido 2 de Cristóbal).
 *
 * El panel hablaba de «a lo largo del hueso» y «de lado a lado», con un tope fijo de ±40 mm que no salía de ningún sitio:
 * Cristóbal no podía llevar la placa más allá de −40 mm, y la nomenclatura no era la de la clínica. Aquí están los cuatro
 * sentidos que usa un cirujano —proximal, distal, anterior, posterior— sobre los ejes del paciente que ya definía
 * `posicionDelPaciente.ts`, y los rangos que salen del hueso que hay en pantalla y no de una cifra.
 *
 * Convenio (el de `posicionDelPaciente.ts`): con el paciente de pie el hueso va hacia arriba, así que **proximal es el
 * sentido positivo del eje largo** (la cabeza del paciente) y **anterior el del eje «de frente»**. Medial y lateral
 * dependen de si el miembro es el derecho o el izquierdo y por eso no se nombran aquí.
 *
 * Es puro y sin three: se prueba con números.
 */

import { ejesDelPaciente, type EjeDelHueso, type Vec3 } from './posicionDelPaciente'

export type DireccionAnatomica = 'proximal' | 'distal' | 'anterior' | 'posterior'

/** Los cuatro sentidos como vectores unitarios del archivo, según el eje largo del hueso. */
export function direccionesAnatomicas(eje: EjeDelHueso): Record<DireccionAnatomica, Vec3> {
  const { hueso, frente } = ejesDelPaciente(eje)
  return {
    proximal: hueso,
    distal: [-hueso[0], -hueso[1], -hueso[2]],
    anterior: frente,
    posterior: [-frente[0], -frente[1], -frente[2]],
  }
}

const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * ¿Hacia qué lado del eje del paciente va un vector? `1` si apunta en el sentido del eje, `-1` si en el contrario y `0` si
 * es perpendicular (a un coseno de 0,15: menos que eso no dice nada y se avisa de que el sentido no se sabe).
 */
export function sentidoSobreElEje(vector: Vec3, eje: Vec3): 1 | -1 | 0 {
  const largo = Math.hypot(vector[0], vector[1], vector[2])
  if (largo === 0) return 0
  const coseno = punto(vector, eje) / largo
  if (Math.abs(coseno) < 0.15) return 0
  return coseno > 0 ? 1 : -1
}

/**
 * «75 mm hacia distal», «12 mm hacia anterior» o «sin desplazar». `positivo` es el sentido al que lleva el signo + del
 * control y `negativo` el contrario; un valor negativo se dice con la dirección contraria y sin signo, que es como se
 * habla en quirófano.
 */
export function textoDelDesplazamiento(mm: number, positivo: DireccionAnatomica | null, negativo: DireccionAnatomica | null): string {
  const redondeado = Math.round(mm * 10) / 10
  if (redondeado === 0) return 'sin desplazar'
  const direccion = redondeado > 0 ? positivo : negativo
  const cifra = String(Math.abs(redondeado)).replace('.', ',')
  return direccion ? `${cifra} mm hacia ${direccion}` : `${redondeado > 0 ? '+' : '−'}${cifra} mm`
}

/** Lo que mide el hueso visible y la placa, en milímetros: de ahí salen los rangos. */
export interface MedidasParaLosRangos {
  /** Largo de la malla de hueso visible a lo largo del eje largo. */
  largoDelHuesoMm: number
  /** Lo más ancho que es el hueso en los otros dos ejes. */
  anchoDelHuesoMm: number
  /** Largo de la placa. */
  largoDeLaPlacaMm: number
}

export interface RangosDelAjuste {
  largoMm: { min: number; max: number }
  ladoMm: { min: number; max: number }
  giroGrados: { min: number; max: number }
}

/** Lo mínimo que se deja mover aunque el hueso sea corto: así el control nunca se queda sin recorrido. */
const RECORRIDO_MINIMO_MM = 15

/**
 * Lo máximo que se deja rodear el hueso: media circunferencia de un hueso largo grande son unos 60 mm. Hace falta el tope
 * porque en algunos modelos todo el esqueleto es una sola malla, y su «ancho» sería el del pie.
 */
const RECORRIDO_MAXIMO_DE_LADO_MM = 60

/**
 * Los rangos del ajuste de la placa. A lo largo: lo que da el hueso, que se mide desde donde se apoyó la placa y por eso
 * se deja el largo entero menos medio largo de placa en cada sentido (la placa puede haberse apoyado en un extremo). De lado
 * a lado: el ancho del hueso (con tope de 60 mm), que es lo que se puede rodear sin dar la vuelta. El giro, ±90°, porque más allá la placa
 * queda de través y no es una posición que nadie use.
 */
export function rangosDeLaPlaca(medidas: MedidasParaLosRangos): RangosDelAjuste {
  const largo = Math.max(RECORRIDO_MINIMO_MM, Math.round(medidas.largoDelHuesoMm - medidas.largoDeLaPlacaMm / 2))
  const lado = Math.min(RECORRIDO_MAXIMO_DE_LADO_MM, Math.max(RECORRIDO_MINIMO_MM, Math.round(medidas.anchoDelHuesoMm)))
  return {
    largoMm: { min: -largo, max: largo },
    ladoMm: { min: -lado, max: lado },
    giroGrados: { min: -90, max: 90 },
  }
}

export const acotar = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor))

/**
 * Lo que se escribió en un campo numérico, o `null` si no es un número. Acepta la coma decimal («7,5»), el signo más y
 * los espacios; `Number('')` es 0 y un campo vacío no es 0, por eso se mira aparte.
 */
export function numeroEscrito(texto: string): number | null {
  const limpio = texto.trim().replace(/\s+/g, '').replace(',', '.').replace(/^\+/, '').replace('−', '-')
  if (limpio === '' || limpio === '-' || limpio === '.') return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}
