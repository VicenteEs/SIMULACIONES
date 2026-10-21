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
      /** Se pone en un clavo y no en una placa: sin clavo en el simulador, no tiene dónde ir (P-003 E6). */
      soloConClavo?: boolean
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
  // De bloqueo de clavo (P-003 E6): se pone en el orificio del clavo, no en una placa. Hasta que el simulador tenga
  // clavos en el hueso no se puede atornillar en nada: se reconoce como tornillo para que se pueda elegir y la consola
  // diga por qué no entra, en vez de quedarse en la mano sin hacer nada.
  'tornillo-bloqueo-clavo-5-0': { tipo: 'tornillo', diametroMm: 5, largoDelModeloMm: 40, bloqueado: true, soloConClavo: true },
}

// ------------------------------------------------- lo que acompaña a cada placa (P-003 E6)

const PARA_3_5 = ['tornillo-cortical-3-5', 'broca-2-5', 'medidor-profundidad', 'destornillador-hexagonal']
const PARA_LCP = ['tornillo-bloqueado-lcp-3-5', 'guia-broca-roscada-lcp', 'destornillador-stardrive']
const PARA_4_5 = ['tornillo-esponjosa-6-5', 'broca-3-2', 'broca-4-5', 'medidor-profundidad', 'destornillador-hexagonal']

/**
 * Qué instrumentos necesita cada placa para ponerse: los tornillos que admite, la broca de cada uno, el medidor y el
 * destornillador. **«No encuentro los tornillos»** (pedido de Cristóbal) era esto: la bandeja del caso solo enseñaba lo
 * que el editor había añadido o lo que piden los pasos, y un caso con una placa pero sin sus tornillos en la bandeja
 * no los mostraba. Con una placa en la bandeja, la consola enseña sus compañeros aunque nadie los haya añadido, marcados
 * «para esta placa». Se decide por `slug` de la placa, como el resto de las reglas del simulador.
 */
export const COMPANEROS_DE_LA_PLACA: Readonly<Record<string, readonly string[]>> = {
  'placa-lcp-recta-3-5': [...PARA_3_5, ...PARA_LCP],
  'placa-lcp-recta-4-5': [...PARA_4_5, ...PARA_LCP],
  'placa-lcp-anatomica-tibia-proximal': [...PARA_3_5, ...PARA_LCP, 'tornillo-esponjosa-6-5', 'broca-3-2'],
  'placa-lc-dcp-3-5': [...PARA_3_5, 'guia-broca-doble-dcp'],
  'placa-dcp-4-5': [...PARA_4_5, 'guia-broca-doble-dcp'],
  'placa-reconstruccion-3-5': PARA_3_5,
  'placa-t-3-5': PARA_3_5,
  'placa-l-3-5': PARA_3_5,
  'placa-tercio-de-cana': PARA_3_5,
  'placa-gancho-clavicular': PARA_3_5,
}

/** Los `slug` de lo que acompaña a estas placas, sin repetir y sin las propias placas. Una placa que no se conoce no suma nada. */
export function companerosDeLasPlacas(slugsDePlacas: readonly (string | null | undefined)[]): string[] {
  const salida = new Set<string>()
  for (const placa of slugsDePlacas) for (const c of (placa && COMPANEROS_DE_LA_PLACA[placa]) || []) salida.add(c)
  return [...salida]
}

/**
 * El calibre de la broca que lleva cada tornillo: lo que se perfora **antes** de atornillar. El cortical y el
 * bloqueado de 3,5 mm, con 2,5; el de esponjosa de 6,5 y el cortical de 4,5, con 3,2; el de bloqueo de clavo de 5,0, con 4,3.
 * Otro calibre, el 70 % redondeado a décimas (la regla del calibre de núcleo).
 */
export function calibreDeBrocaParaElTornillo(diametroMm: number): number {
  const conocidos: Record<string, number> = { '3.5': 2.5, '4.5': 3.2, '6.5': 3.2, '5': 4.3 }
  const clave = String(Math.round(diametroMm * 10) / 10)
  return conocidos[clave] ?? Math.round(diametroMm * 0.7 * 10) / 10
}

/** Qué se anotó en un agujero de la placa: lo que se perforó y lo que se midió. */
export interface EstadoDelAgujero {
  perforado: { diametroMm: number; profundidadMm: number; bicortical: boolean } | null
  medido: { espesorMm: number; sugeridoMm: number } | null
}

export const AGUJERO_VIRGEN: EstadoDelAgujero = { perforado: null, medido: null }

/**
 * El orden real de la fijación (respuesta 5 del dueño): **se perfora, se mide y se atornilla**. El medidor entra
 * en el orificio que hizo la broca, así que sin perforar no hay qué medir; y el tornillo se pide del largo que dijo el
 * medidor. Devuelve lo que falta para el paso que se quiere dar, o `null` si se puede.
 */
export function loQueFaltaPara(paso: 'medir' | 'atornillar', e: EstadoDelAgujero | undefined): 'perforar' | 'medir' | null {
  const estado = e ?? AGUJERO_VIRGEN
  if (!estado.perforado) return 'perforar'
  if (paso === 'atornillar' && !estado.medido) return 'medir'
  return null
}

/** Lo que se le dice al residente cuando falta un paso. */
export function textoDeLoQueFalta(falta: 'perforar' | 'medir', agujero: number, paso: 'medir' | 'atornillar'): string {
  const n = agujero + 1
  if (falta === 'perforar') {
    return paso === 'medir'
      ? `El agujero ${n} todavía no está perforado: el medidor entra en el orificio que hace la broca.`
      : `El agujero ${n} todavía no está perforado: se perfora, se mide y después se atornilla.`
  }
  return `Falta medir el agujero ${n}: el tornillo se pide del largo que dice el medidor.`
}

/** Si la broca con que se perforó no es la del tornillo, qué se avisa; `null` si es la que corresponde. */
export function avisoDeCalibre(perforadoMm: number, tornilloMm: number): string | null {
  const esperado = calibreDeBrocaParaElTornillo(tornilloMm)
  if (Math.abs(perforadoMm - esperado) < 0.05) return null
  const f = (n: number) => String(n).replace('.', ',')
  return perforadoMm < esperado
    ? `Se perforó con ${f(perforadoMm)} mm y este tornillo de ${f(tornilloMm)} mm lleva ${f(esperado)} mm: el agujero quedó estrecho.`
    : `Se perforó con ${f(perforadoMm)} mm y este tornillo de ${f(tornilloMm)} mm lleva ${f(esperado)} mm: el agujero quedó ancho y el tornillo no agarra.`
}

/** Qué coloca un instrumento, o `null` si no es una placa ni un tornillo de placa. */
export function quePuedeColocar(i: { slug?: string | null }): QueColoca | null {
  return (i.slug && COLOCA_POR_SLUG[i.slug]) || null
}

/** Mide la profundidad: el medidor del instrumental, que se apoya en un agujero y lee el espesor del hueso. */
export function sirveParaMedir(i: { slug?: string | null }): boolean {
  return i.slug === 'medidor-profundidad'
}

/**
 * El rango en que se acepta un largo de tornillo escrito (P-004 E6, pedido 5): de 8 a 120 mm. Es más ancho que el de las
 * sugerencias del medidor (10–60) a propósito: un fémur pide tornillos más largos, y escribir un largo absurdo lo juzga
 * `juzgarTornillo` y no este tope.
 */
export const MINIMO_DEL_TORNILLO_MM = 8
export const MAXIMO_DEL_TORNILLO_MM = 120

/**
 * El largo de tornillo que se pide para un espesor medido: lo medido y dos milímetros, en pasos de 2.
 *
 * `antesDelHuesoMm` es lo que hay entre la cara de arriba de la placa y la cortical cercana (la placa
 * misma y la holgura si no apoya del todo). El medidor de profundidad de verdad lee desde la placa, así
 * que lo cuenta. Sin él, el servidor pedía un tornillo de 36 mm para un agujero en el que solo el de 52
 * cruzaba las dos corticales: la placa del caso de prueba quedaba 14 mm sobre el hueso, y el medidor
 * mandaba a poner un tornillo que juzgaba corto él mismo.
 */
export function largoSugerido(espesorMm: number, antesDelHuesoMm = 0): number {
  if (!(espesorMm > 0)) return 10
  const total = espesorMm + Math.max(0, antesDelHuesoMm)
  return Math.min(60, Math.max(10, Math.ceil((total + 2) / 2) * 2))
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
  placa: {
    nombre: string
    agujeros: number
    apoyada: boolean
    separadaDelHuesoMm: number
    /** La placa ya se dio por buena (P-003 E6): solo entonces se perfora por sus agujeros. */
    fijada?: boolean
    /** Cuánto se ha movido desde donde se apoyó: a lo largo y de lado en mm, y el giro sobre la normal en grados. */
    ajuste?: { largoMm: number; ladoMm: number; giroGrados: number }
    /** Cuánto se puede mover cada ajuste según el hueso (P-004 E6) y a qué sentido anatómico lleva el signo + de «de lado». */
    rangos?: { largoMm: { min: number; max: number }; ladoMm: { min: number; max: number }; giroGrados: { min: number; max: number } }
    sentidoDelLado?: 1 | -1 | 0
    /** Los agujeros vienen del modelo o se repartieron por la cantidad que escribió el editor, y el aviso si no coinciden. */
    agujerosDelModelo?: boolean
    aviso?: string | null
  } | null
  tornillos: TornilloPuesto[]
  /** Lo que se perforó y se midió en cada agujero, por su índice (P-003 E6). */
  agujeros?: { indice: number; perforado: EstadoDelAgujero['perforado']; medido: EstadoDelAgujero['medido'] }[]
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
