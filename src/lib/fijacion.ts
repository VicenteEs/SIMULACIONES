/**
 * La fijación con placa y tornillos en el simulador (D-169): qué hace cada
 * implante en la mano y cómo se juzga un tornillo.
 *
 * Como `sutura.ts`, está aparte del lienzo y sin `three`: la geometría la pone la
 * escena, pero **lo que significa** —cuándo un tornillo es bicortical, cuánto
 * puede pasarse, qué largo pedir al medir— son reglas que se prueban con números.
 *
 * ## Las reglas, y de dónde salen
 *
 * - Un tornillo cortical de una placa se pone **bicortical**: cruza las dos
 *   corticales. Sujeta más que uno que solo agarra la cercana.
 * - Se pide de largo lo medido más dos milímetros, que es lo que el cirujano
 *   hace con el medidor de profundidad: que la punta asome un poco por la cortical
 *   opuesta y la rosca la agarre entera. Hasta unos cuatro milímetros de punta
 *   fuera se tolera; más roza partes blandas (tendones, nervios).
 * - Un tornillo que no llega a la cortical opuesta es **unicortical**: no es un
 *   error de cirugía en toda placa (los bloqueados de una placa LCP pueden ir
 *   así), pero sí lo que un paso de «bicortical» no acepta.
 */

export type Vec3 = [number, number, number]

/** Qué le hace un implante al paciente: se coloca sobre el hueso. */
export type QueColoca =
  | { tipo: 'placa' }
  | {
      tipo: 'tornillo'
      diametroMm: number
      /** Lo que mide el modelo del catálogo, bajo la cabeza, en mm: el largo se escala desde él. */
      largoDelModeloMm: number
      /** De cabeza roscada: se traba en la placa. */
      bloqueado: boolean
    }

const COLOCA_POR_SLUG: Readonly<Record<string, QueColoca>> = {
  'placa-dcp-4-5': { tipo: 'placa' },
  'placa-lc-dcp-3-5': { tipo: 'placa' },
  'placa-lcp-recta-3-5': { tipo: 'placa' },
  'placa-lcp-recta-4-5': { tipo: 'placa' },
  'placa-lcp-anatomica-tibia-proximal': { tipo: 'placa' },
  'placa-tercio-de-cana': { tipo: 'placa' },
  'placa-reconstruccion-3-5': { tipo: 'placa' },
  'placa-t-3-5': { tipo: 'placa' },
  'placa-l-3-5': { tipo: 'placa' },
  'placa-gancho-clavicular': { tipo: 'placa' },
  'tornillo-cortical-3-5': { tipo: 'tornillo', diametroMm: 3.5, largoDelModeloMm: 24, bloqueado: false },
  'tornillo-esponjosa-6-5': { tipo: 'tornillo', diametroMm: 6.5, largoDelModeloMm: 50, bloqueado: false },
  'tornillo-bloqueado-lcp-3-5': { tipo: 'tornillo', diametroMm: 3.5, largoDelModeloMm: 26, bloqueado: true },
}

/** Qué coloca un instrumento, o `null` si no es una placa ni un tornillo de placa. */
export function quePuedeColocar(i: { slug?: string | null }): QueColoca | null {
  return (i.slug && COLOCA_POR_SLUG[i.slug]) || null
}

/** Mide la profundidad: el medidor del instrumental, que se apoya en un agujero y lee el espesor del hueso. */
export function sirveParaMedir(i: { slug?: string | null }): boolean {
  return i.slug === 'medidor-profundidad'
}

/** El largo de tornillo que se pide para un espesor medido: lo medido y dos milímetros, en pasos de 2. */
export function largoSugerido(espesorMm: number): number {
  if (!(espesorMm > 0)) return 10
  return Math.min(60, Math.max(10, Math.ceil((espesorMm + 2) / 2) * 2))
}

/** Hasta cuánto puede asomar la punta por la cortical opuesta antes de molestar a las partes blandas. */
export const PUNTA_FUERA_MAXIMA_MM = 4

export interface JuicioDeTornillo {
  /** Cruza las dos corticales. */
  bicortical: boolean
  /** Cuánto asoma la punta por la cortical opuesta, en mm. Negativo: cuánto le falta para llegar. */
  puntaFueraMm: number
  /** Asoma más de lo tolerable. */
  largo: boolean
  /** Si algo no está bien, qué. */
  aviso: string | null
}

/**
 * Qué tal quedó un tornillo.
 *
 * `largoMm` es lo que mide el tornillo desde la cara superior de la placa (bajo la
 * cabeza); `grosorDeLaPlacaMm` lo que mide la placa; `distanciaAlHuesoMm` cuánto
 * falta de la cara inferior de la placa a la cortical cercana; `espesorMm` el
 * hueso de lado a lado, de cortical cercana a opuesta, en el eje del agujero.
 */
export function juzgarTornillo(p: {
  largoMm: number
  grosorDeLaPlacaMm: number
  distanciaAlHuesoMm: number
  espesorMm: number
}): JuicioDeTornillo {
  // Lo que entra en el hueso: el tornillo menos lo que ocupa la placa y el hueco hasta el hueso.
  const dentro = p.largoMm - p.grosorDeLaPlacaMm - p.distanciaAlHuesoMm
  const puntaFueraMm = dentro - p.espesorMm
  const bicortical = puntaFueraMm >= -0.5
  const largo = puntaFueraMm > PUNTA_FUERA_MAXIMA_MM
  let aviso: string | null = null
  if (dentro <= 0) {
    aviso = 'El tornillo no llega al hueso: es demasiado corto.'
  } else if (!bicortical) {
    aviso = `El tornillo se queda ${Math.abs(puntaFueraMm).toFixed(0)} mm antes de la cortical opuesta: agarra solo una cortical.`
  } else if (largo) {
    aviso = `La punta asoma ${puntaFueraMm.toFixed(0)} mm por la cortical opuesta: es largo y roza las partes blandas (se tolera hasta ${PUNTA_FUERA_MAXIMA_MM} mm).`
  }
  return { bicortical, puntaFueraMm, largo, aviso }
}

/**
 * El índice del agujero más cercano a un punto, o `null` si ninguno cae a menos de
 * `maximoMm`. Las posiciones y el punto, en milímetros y en el mismo marco.
 */
export function agujeroMasCercano(agujeros: readonly Vec3[], punto: Vec3, maximoMm: number): number | null {
  let mejor: number | null = null
  let mejorDistancia = maximoMm
  agujeros.forEach((a, i) => {
    const d = Math.hypot(a[0] - punto[0], a[1] - punto[1], a[2] - punto[2])
    if (d <= mejorDistancia) {
      mejorDistancia = d
      mejor = i
    }
  })
  return mejor
}

/** Un tornillo ya puesto, tal como lo cuenta el lienzo. */
export interface TornilloPuesto {
  /** Índice del agujero de la placa. */
  agujero: number
  largoMm: number
  diametroMm: number
  bicortical: boolean
  puntaFueraMm: number
  espesorMm: number
  bloqueado: boolean
  aviso: string | null
}

/** Lo que hay fijado ahora mismo: la placa y sus tornillos. */
export interface EstadoDeLaFijacion {
  placa: { nombre: string; agujeros: number; apoyada: boolean; separadaDelHuesoMm: number } | null
  tornillos: TornilloPuesto[]
}

/**
 * El resumen de la fijación para evaluar un paso: cuántos tornillos y cuántos
 * son bicorticales. Una placa sin tornillos no fija nada.
 */
export function resumenDeLaFijacion(estado: EstadoDeLaFijacion | null): {
  placa: boolean
  tornillos: number
  bicorticales: number
  largos: number
} {
  if (!estado?.placa) return { placa: false, tornillos: 0, bicorticales: 0, largos: 0 }
  return {
    placa: true,
    tornillos: estado.tornillos.length,
    bicorticales: estado.tornillos.filter((t) => t.bicortical).length,
    largos: estado.tornillos.filter((t) => t.puntaFueraMm > PUNTA_FUERA_MAXIMA_MM).length,
  }
}
