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

import type { ReduccionDelFoco } from './enclavado'
import { sistemaDelSlug } from './placasRectas'
// Solo el tipo: `tornillos.ts` importa este módulo, y un `import` de valor en sentido contrario sería un ciclo.
import type { TipoDeTornillo } from './tornillos'
import type { TornillosDelFragmento } from './simulador'

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
// La broca de 2,8 es la del bloqueado de 3,5 (D-300): hasta entonces la placa LCP se ofrecía sin ella, y su tornillo solo se podía
// perforar con la de 2,5 del cortical, que deja el agujero estrecho.
const PARA_LCP = ['tornillo-bloqueado-lcp-3-5', 'broca-2-8', 'guia-broca-roscada-lcp', 'destornillador-stardrive']
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

// ------------------------------------------------- la broca de cada tornillo (D-300)

/**
 * Lo que hace falta saber de un tornillo, además del diámetro, para elegir su broca. El diámetro solo no basta: el bloqueado de 3,5
 * lleva 2,8 y el cortical del mismo diámetro, 2,5; el perno de un clavo de 5,0 lleva 4,2 y el bloqueado de placa de 5,0, 4,3.
 */
export interface ClaseDelTornillo {
  /** El tipo de la bandeja (`tipoDelTornillo`): cortical, de esponjosa, de rosca parcial, bloqueado… */
  tipo?: TipoDeTornillo | null
  /** De cabeza roscada, que se traba en la placa (`QueColoca.bloqueado`). */
  bloqueado?: boolean
  /** Va por un orificio de un clavo y no por una placa (`QueColoca.soloConClavo`): es un perno de bloqueo. */
  deClavo?: boolean
}

export type FamiliaDeBroca = 'cortical' | 'bloqueado' | 'esponjosa' | 'perno-de-clavo'

/**
 * La broca de cada tornillo, por familia y por diámetro exterior, de las guías de técnica de AO. La clave es el diámetro con un
 * decimal, como la escribe `String` (2,0 es `'2'`). Las que falta confirmar con la guía de su implante están en
 * `BROCAS_POR_CONFIRMAR`; las valida Cristóbal.
 *
 * Antes de D-300 había una sola tabla por diámetro (3,5 → 2,5; 4,5 y 6,5 → 3,2; 5 → 4,3) y lo demás salía del 70 %. Con ella el
 * bloqueado de 3,5 se perforaba con 2,5, como el cortical, y el residente que usaba la broca buena oía que «el agujero quedó ancho».
 * Del 70 % salían el 2,7 con 1,9, el 2,4 con 1,7 y la esponjosa de 4,0 con 2,8: ninguna de esas brocas existe.
 */
export const BROCA_DEL_TORNILLO: Readonly<Record<FamiliaDeBroca, Readonly<Record<string, number>>>> = {
  cortical: { '4.5': 3.2, '3.5': 2.5, '2.7': 2, '2.4': 1.8, '2': 1.5, '1.5': 1.1 },
  bloqueado: { '5': 4.3, '3.5': 2.8, '2.7': 2, '2.4': 1.8, '2': 1.5 },
  esponjosa: { '6.5': 3.2, '4': 2.5 },
  'perno-de-clavo': { '5': 4.2, '4': 3.2 },
}

/** Las cifras de `BROCA_DEL_TORNILLO` que se usan sin haberlas confirmado con la guía de técnica de su implante. */
export const BROCAS_POR_CONFIRMAR: readonly { familia: FamiliaDeBroca; diametroMm: number; nota: string }[] = [
  { familia: 'bloqueado', diametroMm: 5, nota: 'La de AO es de 4,3; otro fabricante usa 4,1.' },
  { familia: 'perno-de-clavo', diametroMm: 5, nota: 'La del clavo tibial de AO; otro clavo puede pedir otra.' },
  { familia: 'perno-de-clavo', diametroMm: 4, nota: 'La del clavo tibial de AO; otro clavo puede pedir otra.' },
]

/** La clave de un diámetro en la tabla: con un decimal, sin ceros de más. */
const claveDelDiametro = (diametroMm: number) => String(Math.round(diametroMm * 10) / 10)

/** En qué familias de la tabla se busca la broca de un tornillo, en orden: manda la primera que tenga su diámetro. */
function familiasDelTornillo(clase: ClaseDelTornillo): readonly FamiliaDeBroca[] {
  if (clase.deClavo) return ['perno-de-clavo']
  // Un tornillo de cabeza roscada lleva la broca del bloqueado aunque su tipo diga otra cosa: su núcleo es más grueso.
  if (clase.bloqueado || clase.tipo === 'bloqueado') return ['bloqueado']
  if (clase.tipo === 'cortical') return ['cortical']
  // La rosca parcial es de esponjosa (4,0 y 6,5) o maleolar (4,5, con la broca del cortical de 4,5).
  if (clase.tipo === 'esponjosa' || clase.tipo === 'rosca-parcial') return ['esponjosa', 'cortical']
  // El canulado se perfora sobre la aguja guía con su propia broca canulada, que la tabla no tiene: sale estimado.
  if (clase.tipo === 'canulado') return []
  // Sin tipo, el mismo orden que la tabla única de antes de D-300: el cortical (3,5 y 4,5), la esponjosa (6,5) y el bloqueado (5,0).
  return ['cortical', 'esponjosa', 'bloqueado']
}

export interface BrocaDelTornillo {
  mm: number
  /** No sale de la tabla de AO sino de la regla del 70 % (el calibre de núcleo): la consola lo dice para que no pase por una cifra de AO. */
  estimada: boolean
}

/** La broca que lleva un tornillo: lo que se perfora **antes** de atornillarlo. */
export function brocaDelTornillo(diametroMm: number, clase: ClaseDelTornillo = {}): BrocaDelTornillo {
  const clave = claveDelDiametro(diametroMm)
  for (const familia of familiasDelTornillo(clase)) {
    const mm = BROCA_DEL_TORNILLO[familia][clave]
    if (mm !== undefined) return { mm, estimada: false }
  }
  return { mm: Math.round(diametroMm * 0.7 * 10) / 10, estimada: true }
}

/** El calibre de la broca de un tornillo, en mm (`brocaDelTornillo` sin decir si es estimada). */
export function calibreDeBrocaParaElTornillo(diametroMm: number, clase: ClaseDelTornillo = {}): number {
  return brocaDelTornillo(diametroMm, clase).mm
}

/** La clase de un tornillo a partir de lo que coloca y de su tipo en la bandeja. */
export function claseDelTornillo(coloca: QueColoca | null | undefined, tipo?: TipoDeTornillo | null): ClaseDelTornillo {
  if (!coloca || coloca.tipo !== 'tornillo') return { tipo: tipo ?? null }
  return { tipo: tipo ?? null, bloqueado: coloca.bloqueado, deClavo: !!coloca.soloConClavo }
}

/** Cómo se nombra el tornillo en un aviso: «este tornillo bloqueado de 3,5 mm». */
function nombreDeLaClase(clase: ClaseDelTornillo): string {
  if (clase.deClavo) return 'perno de bloqueo'
  if (clase.bloqueado || clase.tipo === 'bloqueado') return 'tornillo bloqueado'
  if (clase.tipo === 'cortical') return 'tornillo cortical'
  if (clase.tipo === 'esponjosa') return 'tornillo de esponjosa'
  if (clase.tipo === 'rosca-parcial') return 'tornillo de rosca parcial'
  if (clase.tipo === 'canulado') return 'tornillo canulado'
  return 'tornillo'
}

/** Qué se anotó en un agujero de la placa: lo que se perforó y lo que se midió. */
export interface EstadoDelAgujero {
  perforado: { diametroMm: number; profundidadMm: number; bicortical: boolean } | null
  medido: { espesorMm: number; sugeridoMm: number } | null
  /**
   * Cuánto se corrió la broca del centro de un orificio oval, con signo y a lo largo de la placa (P-004 E10). `undefined` en un
   * orificio redondo o donde no se eligió: es la perforación céntrica.
   */
  desviacionMm?: number
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

/**
 * Si la broca con que se perforó no es la del tornillo, qué se avisa; `null` si es la que corresponde. Sin la clase, el tornillo se
 * juzga como antes de D-300, por el diámetro solo: un bloqueado de 3,5 pasaría por cortical y pediría la broca de 2,5.
 */
export function avisoDeCalibre(perforadoMm: number, tornilloMm: number, clase: ClaseDelTornillo = {}): string | null {
  const broca = brocaDelTornillo(tornilloMm, clase)
  if (Math.abs(perforadoMm - broca.mm) < 0.05) return null
  const f = (n: number) => String(n).replace('.', ',')
  const lleva = `este ${nombreDeLaClase(clase)} de ${f(tornilloMm)} mm lleva ${f(broca.mm)} mm${broca.estimada ? ' (estimado: no está en la tabla de AO)' : ''}`
  return perforadoMm < broca.mm
    ? `Se perforó con ${f(perforadoMm)} mm y ${lleva}: el agujero quedó estrecho.`
    : `Se perforó con ${f(perforadoMm)} mm y ${lleva}: el agujero quedó ancho y el tornillo no agarra.`
}

/** Qué coloca un instrumento, o `null` si no es una placa ni un tornillo de placa. */
export function quePuedeColocar(i: { slug?: string | null }): QueColoca | null {
  // Las de los sistemas de placa recta que no tienen modelo en el catálogo (la LCP 2,4, la DCP 3,5…) solo existen a
  // medida (P-008 E3): se reconocen por su sistema y no por la tabla, para no tener que repetirlas aquí.
  return (i.slug && COLOCA_POR_SLUG[i.slug]) || (sistemaDelSlug(i.slug) ? { tipo: 'placa' } : null)
}

/** Mide la profundidad: el medidor del instrumental, que se apoya en un agujero y lee el espesor del hueso. */
export function sirveParaMedir(i: { slug?: string | null }): boolean {
  return i.slug === 'medidor-profundidad'
}

/**
 * El rango en que se acepta un largo de tornillo escrito (P-004 E6, pedido 5): de 8 a 120 mm. Es más ancho que el de cada serie
 * (`SERIES_DE_LARGOS`) a propósito: escribir un largo absurdo lo juzga `juzgarTornillo` y no este tope.
 */
export const MINIMO_DEL_TORNILLO_MM = 8
export const MAXIMO_DEL_TORNILLO_MM = 120

// ------------------------------------------------- los largos que existen (D-301)

/** Los largos en que viene un tornillo: del más corto al más largo, de `pasoMm` en `pasoMm`. */
export interface SerieDeLargos {
  minimoMm: number
  maximoMm: number
  pasoMm: number
  /** Cómo se dice en pantalla, con su artículo: «en el pequeño fragmento», «en la esponjosa de 6,5». */
  nombre: string
}

/**
 * Las series del catálogo base (`INSTRUMENTAL_BASE`, en `instrumental.ts`): el cortical y el bloqueado de 3,5, de 10 a 60 mm de 2 en 2;
 * la esponjosa de 6,5, de 30 a 120 de 5 en 5; el perno del clavo, de 20 a 100. El medidor mide hasta 60 en el pequeño fragmento y
 * hasta 110 en el gran fragmento, como dice su ficha.
 *
 * Antes de D-301 el medidor nunca sugería más de 60: en una diáfisis de fémur, o con la placa de 4,5 sobre una tibia gruesa, pedía un
 * tornillo que el propio `juzgarTornillo` daba por unicortical.
 */
export const SERIES_DE_LARGOS = {
  pequenoFragmento: { minimoMm: 10, maximoMm: 60, pasoMm: 2, nombre: 'el pequeño fragmento' },
  granFragmento: { minimoMm: 10, maximoMm: 110, pasoMm: 2, nombre: 'el gran fragmento' },
  esponjosa65: { minimoMm: 30, maximoMm: 120, pasoMm: 5, nombre: 'la esponjosa de 6,5' },
  pernoDeClavo: { minimoMm: 20, maximoMm: 100, pasoMm: 2, nombre: 'los pernos del clavo' },
} as const satisfies Record<string, SerieDeLargos>

/**
 * La serie de un sistema, sabiendo solo con qué broca se perforó: con menos de 3 mm (2,5 y 2,8, y las del minifragmento) es el pequeño
 * fragmento; con más (3,2 y 4,3), el gran fragmento. Es lo que sabe el medidor cuando entra en el agujero, antes de que se elija el
 * tornillo.
 */
export function serieDelSistema(brocaMm: number | null | undefined): SerieDeLargos {
  return typeof brocaMm === 'number' && brocaMm >= 3 ? SERIES_DE_LARGOS.granFragmento : SERIES_DE_LARGOS.pequenoFragmento
}

/** La serie de un tornillo conocido, por su diámetro y su clase. */
export function serieDelTornillo(diametroMm: number, clase: ClaseDelTornillo = {}): SerieDeLargos {
  if (clase.deClavo) return SERIES_DE_LARGOS.pernoDeClavo
  if ((clase.tipo === 'esponjosa' || clase.tipo === 'rosca-parcial') && diametroMm >= 6) return SERIES_DE_LARGOS.esponjosa65
  return diametroMm <= 4 ? SERIES_DE_LARGOS.pequenoFragmento : SERIES_DE_LARGOS.granFragmento
}

/** El largo de la serie que sigue a `mm`, o el mismo si existe: el más corto que no se queda corto, sin salir de la serie. */
export function largoDeLaSerie(mm: number, serie: SerieDeLargos): number {
  // Una millonésima de paso de margen: un espesor de 20 mm que llega como 20,000000001 no tiene que pedir el tornillo siguiente.
  const pasos = Math.ceil((mm - serie.minimoMm) / serie.pasoMm - 1e-6)
  return Math.min(serie.maximoMm, Math.max(serie.minimoMm, serie.minimoMm + pasos * serie.pasoMm))
}

/** Lo que tiene que medir el tornillo para un espesor medido: el espesor, la placa y la holgura, y dos milímetros de punta. */
function largoQueHaceFalta(espesorMm: number, antesDelHuesoMm: number): number {
  return espesorMm + Math.max(0, antesDelHuesoMm) + 2
}

/**
 * El largo de tornillo que se pide para un espesor medido: lo medido y dos milímetros, redondeado al largo siguiente de la serie.
 *
 * `antesDelHuesoMm` es lo que hay entre la cara de arriba de la placa y la cortical cercana (la placa
 * misma y la holgura si no apoya del todo). El medidor de profundidad de verdad lee desde la placa, así
 * que lo cuenta. Sin él, el servidor pedía un tornillo de 36 mm para un agujero en el que solo el de 52
 * cruzaba las dos corticales: la placa del caso de prueba quedaba 14 mm sobre el hueso, y el medidor
 * mandaba a poner un tornillo que juzgaba corto él mismo.
 *
 * Sin serie, la del pequeño fragmento, que es la que había antes de D-301.
 */
export function largoSugerido(espesorMm: number, antesDelHuesoMm = 0, serie: SerieDeLargos = SERIES_DE_LARGOS.pequenoFragmento): number {
  if (!(espesorMm > 0)) return serie.minimoMm
  return largoDeLaSerie(largoQueHaceFalta(espesorMm, antesDelHuesoMm), serie)
}

/**
 * Lo que se le dice a quien mide cuando el tornillo más largo de la serie no alcanza: cuánto haría falta y hasta dónde llega. `null` si
 * alcanza. Antes de D-301 el medidor pedía el de 60 sin decir nada, aunque no llegara a la cortical opuesta.
 */
export function avisoDelLargo(espesorMm: number, antesDelHuesoMm: number, serie: SerieDeLargos): string | null {
  if (!(espesorMm > 0)) return null
  const hacenFalta = largoQueHaceFalta(espesorMm, antesDelHuesoMm)
  if (hacenFalta <= serie.maximoMm + 1e-6) return null
  return `Harían falta ${Math.ceil(hacenFalta)} mm, y en ${serie.nombre} el más largo es de ${serie.maximoMm} mm.`
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
  /**
   * Índice del agujero de la placa. Un tornillo puesto por una trayectoria de dos clics, sin agujero de placa (P-004 E9),
   * lleva un número negativo y `libre: true`.
   */
  agujero: number
  /** Puesto por una trayectoria elegida con dos clics y no por un agujero de placa (P-004 E9). */
  libre?: boolean
  largoMm: number
  diametroMm: number
  bicortical: boolean
  puntaFueraMm: number
  espesorMm: number
  bloqueado: boolean
  aviso: string | null
  /** Pasa por este orificio del clavo («P1», «D2»…): es un tornillo de bloqueo (P-005 E6). */
  deClavo?: string
  /** Cómo apuntó el tornillo de bloqueo al orificio (P-005 E6). */
  punteria?: 'acierta' | 'roza' | 'falla'
  /** Con qué se apretó y qué se avisó (P-005 E6); sin esto, el tornillo está puesto y sin apretar. */
  apriete?: { apretado: boolean; texto: string; aviso: string | null }
  /**
   * Puesto por una trayectoria que cruza la fractura (D-308): pasa de un fragmento al otro y bloquea el foco, comprima
   * o no. Lo marca la escena, que es la que sabe dónde corta la trayectoria al trazo.
   */
  cruzaLaFractura?: boolean
}

/** Un trozo de hueso bajo la placa (P-009). */
export interface TrozoBajoLaPlaca {
  /** El nombre de su malla, que es el nodo de su pieza. */
  nodo: string
  /** Cuántos agujeros de la placa caen sobre él. */
  agujeros: number
  /** Lo más cerca que queda la placa de él, en mm: unas décimas si se apoya en él; varios milímetros, si no lo toca. */
  holguraMinimaMm: number
}

/** Cómo quedó asentada la placa como un sólido sobre el hueso (P-009): cuánto toca y sobre qué trozos. */
export interface ResumenDelAsiento {
  /** Qué parte de la cara de abajo toca el hueso, a medio milímetro o menos, en %. */
  contactoPct: number
  /** Qué parte queda sin hueso debajo, en %: la placa se sale por un borde del hueso. */
  sinHuesoPct: number
  holguraMediaMm: number
  /** Los trozos bajo la placa, del que más agujeros tiene al que menos. */
  trozos: TrozoBajoLaPlaca[]
  /** Los agujeros que no tienen hueso debajo. */
  agujerosSinHueso: number
  /**
   * El trozo bajo cada agujero, por su índice (D-309): el nodo de su malla, o `null` si ese agujero no tiene hueso debajo.
   * Es lo que permite contar los tornillos por fragmento y saber cuándo la placa ya toma los dos. Opcional porque una
   * sesión guardada antes no lo trae: sin él se cuentan todos juntos, como antes.
   */
  trozoDeCadaAgujero?: (string | null)[]
}

/**
 * A partir de cuántos milímetros un trozo bajo la placa no está apoyado (P-009). Asentada como un sólido, la placa queda
 * a dos décimas del trozo en que se apoya, y del que está sin reducir, a lo que mide el escalón. El milímetro deja fuera
 * las décimas que pone la curva del hueso bajo una placa recta.
 */
export const NO_APOYA_MM = 1

/**
 * Hasta dónde puede estar abierto el foco para fijar con placa: los topes que un paso trae por defecto
 * (`topesDeReduccion`, 5 mm y 5°). Más abierto, la placa se apoya en un fragmento y en el borde del otro, y la holgura
 * bajo cada uno no lo delata: en el caso 3053 sin reducir (12,5 mm, 9,8°, 18 mm de diástasis) tocaba los dos por una
 * esquina y el mensaje no decía nada (las capturas de «después» de P-009).
 */
export const FOCO_PARA_FIJAR = { desplazamientoMm: 5, angulacionGrados: 5, diastasisMm: 5 } as const

/**
 * Cuántos agujeros pide cada fragmento de una diáfisis: tres tornillos bicorticales a cada lado de la fractura, seis
 * corticales, que es la regla de la AO para una placa de compresión. Con menos, la placa no sostiene ese fragmento.
 */
export const AGUJEROS_POR_FRAGMENTO = 3

/**
 * Lo que se le dice a quien opera al apoyar o al mover la placa (P-009; el dueño la quería «como si de verdad afirmara
 * esos dos fragmentos»): sobre qué fragmento cae cada agujero, si a alguno le faltan para sostenerlo, si la placa no
 * apoya en uno —a cuánto queda, y que se reduzca antes de fijarla— y si algún agujero se queda sin hueso debajo.
 * `atencion` cuando hay algo que corregir antes de fijarla.
 *
 * `hayFractura` lo dice el caso (un trozo marcado como fragmento). Sin fractura, una placa sobre un solo trozo es lo
 * normal y no hay lados que contar: solo se avisa de los agujeros sin hueso. `foco` es la lectura de la reducción que
 * ve la consola; con el foco abierto, eso va primero, y lo que no apoya ya no hace falta decirlo trozo a trozo.
 */
export function avisoDelAsiento(
  a: ResumenDelAsiento,
  nombreDe: (nodo: string) => string,
  hayFractura: boolean,
  foco?: ReduccionDelFoco | null,
): { texto: string; atencion: boolean } {
  const partes: string[] = []
  let atencion = false
  const coma = (n: number) => n.toFixed(1).replace('.', ',').replace(/,0$/, '')
  const abierto = hayFractura && foco ? cifrasDelFocoAbierto(foco, coma) : []
  if (abierto.length > 0) {
    partes.push(
      `La fractura no está reducida (${abierto.join(', ')}): la placa no puede apoyar en los dos fragmentos. Redúzcala antes de fijarla.`,
    )
    atencion = true
  }
  const conAgujeros = a.trozos.filter((t) => t.agujeros > 0)
  if (hayFractura && conAgujeros.length >= 2) {
    partes.push(`Agujeros sobre cada fragmento: ${conAgujeros.map((t) => `${nombreDe(t.nodo)}, ${t.agujeros}`).join('; ')}.`)
    // Lo que no apoya, con el foco dentro de los topes: un escalón que la lectura no ve, como un tercer fragmento.
    const sueltos = abierto.length > 0 ? [] : conAgujeros.filter((t) => t.holguraMinimaMm > NO_APOYA_MM)
    for (const t of sueltos) {
      partes.push(`No apoya en ${nombreDe(t.nodo)}: queda a ${coma(t.holguraMinimaMm)} mm. Reduzca la fractura antes de fijarla.`)
    }
    const cortos = conAgujeros.filter((t) => t.agujeros < AGUJEROS_POR_FRAGMENTO)
    if (cortos.length > 0) {
      partes.push(
        `${cortos.map((t) => nombreDe(t.nodo)).join(' y ')}: menos de ${AGUJEROS_POR_FRAGMENTO} agujeros, y así la placa no ${cortos.length > 1 ? 'los' : 'lo'} sostiene. Córrala o elija una más larga.`,
      )
    }
    atencion ||= sueltos.length > 0 || cortos.length > 0
  } else if (hayFractura && conAgujeros.length === 1) {
    // Una placa entera sobre un fragmento no fija nada: es el error de apoyarla lejos del trazo.
    partes.push(
      `Todos sus agujeros caen en ${nombreDe(conAgujeros[0].nodo)}: no cruza la fractura. Córrala hasta que la fractura quede bajo su centro.`,
    )
    atencion = true
  }
  if (a.agujerosSinHueso > 0) {
    partes.push(
      a.agujerosSinHueso === 1
        ? 'Un agujero se queda sin hueso debajo: la placa se sale del borde.'
        : `${a.agujerosSinHueso} agujeros se quedan sin hueso debajo: la placa se sale del borde.`,
    )
    atencion = true
  }
  return { texto: partes.join(' '), atencion }
}

/** Las cifras del foco que pasan de lo que admite una placa, en palabras: vacío si está reducido. */
function cifrasDelFocoAbierto(foco: ReduccionDelFoco, coma: (n: number) => string): string[] {
  const cifras: string[] = []
  if (foco.desplazamientoMm > FOCO_PARA_FIJAR.desplazamientoMm) cifras.push(`desplazamiento ${coma(foco.desplazamientoMm)} mm`)
  if (foco.angulacionGrados > FOCO_PARA_FIJAR.angulacionGrados) cifras.push(`angulación ${coma(foco.angulacionGrados)}°`)
  if ((foco.diastasisMm ?? 0) > FOCO_PARA_FIJAR.diastasisMm) cifras.push(`diástasis ${coma(foco.diastasisMm ?? 0)} mm`)
  return cifras
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
    /**
     * La forma de los orificios (P-004 E10): en los ovales y los combinados se elige dónde brocar; el semilargo del óvalo, en mm, y
     * hacia qué sentido del eje de la placa está la fractura respecto de cada orificio (vacío si no se sabe dónde está), y cuánto
     * se corrió la broca en cada uno.
     */
    forma?: 'redondo' | 'oval' | 'combi'
    semilargoDelOvalMm?: number
    ladoDeLaFractura?: Record<number, 1 | -1>
    desviaciones?: Record<number, number>
    /** Los agujeros vienen del modelo o se repartieron por la cantidad que escribió el editor, y el aviso si no coinciden. */
    agujerosDelModelo?: boolean
    aviso?: string | null
    /** Cómo quedó asentada (P-009): sobre qué fragmentos y con cuántos agujeros en cada uno. */
    asiento?: ResumenDelAsiento | null
  } | null
  tornillos: TornilloPuesto[]
  /** Lo que se perforó y se midió en cada agujero, por su índice (P-003 E6). */
  agujeros?: { indice: number; perforado: EstadoDelAgujero['perforado']; medido: EstadoDelAgujero['medido'] }[]
  /**
   * La trayectoria elegida con dos clics (P-004 E9), o `null`: de la entrada a la salida, con lo que se perforó y se midió por
   * ella, que es lo mismo que se anota en un agujero de placa.
   */
  trayectoria?: { largoMm: number; anguloConElEje: number; perforado: EstadoDelAgujero['perforado']; medido: EstadoDelAgujero['medido'] } | null
  /** Cuánto se ha comprimido la fractura con los tornillos puestos y con qué técnicas (P-004 E10); `null` si nada. */
  compresion?: { mm: number; tecnicas: ('excentrico' | 'deslizamiento' | 'rosca-parcial')[] } | null
}

/** Lo que `resumenDeLaFijacion` necesita saber del caso para contar por fragmento (D-309). */
export interface OpcionesDelResumen {
  /** El caso tiene un trozo marcado como fragmento: hay fractura, y hay lados que contar. */
  hayFractura?: boolean
  /** Cómo se nombra un trozo ante quien opera: la etiqueta de su pieza o, sin ella, el nodo. */
  nombreDe?: (nodo: string) => string
}

/** Los tornillos puestos por los agujeros de la placa: ni los de una trayectoria ni los del clavo. */
const deLaPlaca = (t: TornilloPuesto) => !t.libre && !t.deClavo && t.agujero >= 0

/**
 * Los tornillos de la placa en cada fragmento principal (D-309), o `undefined` si no hay con qué contarlos: sin fractura,
 * sin placa o con una placa asentada antes de que el asiento dijera el trozo de cada agujero.
 *
 * Los principales son los dos trozos con más agujeros debajo. Un tercero —una mariposa bajo la placa— no tiene que
 * llevar tres tornillos, y contarlo dejaría sin aprobar una placa bien puesta.
 */
function tornillosPorFragmento(estado: EstadoDeLaFijacion, opciones: OpcionesDelResumen): TornillosDelFragmento[] | undefined {
  const porAgujero = estado.placa?.asiento?.trozoDeCadaAgujero
  if (!opciones.hayFractura || !estado.placa?.asiento || !porAgujero) return undefined
  const nombreDe = opciones.nombreDe ?? ((nodo: string) => nodo.replace(/_/g, ' '))
  return estado.placa.asiento.trozos
    .filter((t) => t.agujeros > 0)
    .slice(0, 2)
    .map((t) => {
      const suyos = estado.tornillos.filter((s) => deLaPlaca(s) && porAgujero[s.agujero] === t.nodo)
      return { nodo: t.nodo, nombre: nombreDe(t.nodo), tornillos: suyos.length, bloqueados: suyos.filter((s) => s.bloqueado).length }
    })
}

/**
 * Si lo puesto ya bloquea el foco (D-308): los dos fragmentos quedan unidos por el implante y la reducción, congelada.
 *
 * - Un tornillo que cruza la fractura: el de tracción, o cualquiera puesto por una trayectoria que pasa de un trozo al
 *   otro (`cruzaLaFractura`, que marca la escena).
 * - La placa con tornillos en dos fragmentos. Con el primero en un trozo la placa todavía se puede corregir; el que
 *   entra en el segundo es el que fija.
 * - El clavo con un tornillo de bloqueo que agarró su orificio arriba y otro abajo. Uno que falló el orificio no bloquea
 *   nada (`bloqueoDelClavo.ts`).
 *
 * Es la regla de cuándo se mide la reducción para el error de fijar sin reducir (`juicioDelBloqueo`, `simulador.ts`).
 */
export function focoBloqueado(estado: EstadoDeLaFijacion | null): boolean {
  if (!estado) return false
  const tornillos = estado.tornillos
  if (tornillos.some((t) => t.cruzaLaFractura)) return true
  const agarra = (t: TornilloPuesto, zona: 'P' | 'D') => !!t.deClavo?.startsWith(zona) && t.punteria !== 'falla'
  if (tornillos.some((t) => agarra(t, 'P')) && tornillos.some((t) => agarra(t, 'D'))) return true
  const porAgujero = estado.placa?.asiento?.trozoDeCadaAgujero
  if (!porAgujero) return false
  const trozos = new Set(tornillos.filter(deLaPlaca).map((t) => porAgujero[t.agujero] ?? null).filter((n): n is string => !!n))
  return trozos.size >= 2
}

/**
 * El resumen de la fijación para evaluar un paso: cuántos tornillos y cuántos
 * son bicorticales. Una placa sin tornillos no fija nada.
 *
 * Con `opciones.hayFractura`, además los tornillos de la placa en cada fragmento principal (D-309).
 */
export function resumenDeLaFijacion(
  estado: EstadoDeLaFijacion | null,
  opciones: OpcionesDelResumen = {},
): {
  placa: boolean
  tornillos: number
  bicorticales: number
  largos: number
  /** Cuánto se comprimió la fractura con lo puesto, en mm (P-004 E10). */
  compresionMm: number
  porFragmento?: TornillosDelFragmento[]
} {
  const compresionMm = estado?.compresion?.mm ?? 0
  // Sin placa pero con tornillos (los de una trayectoria de dos clics, P-004 E9) se cuentan igual: un tornillo de tracción es una fijación.
  if (!estado?.placa) {
    return {
      placa: false,
      tornillos: estado?.tornillos.length ?? 0,
      bicorticales: estado?.tornillos.filter((t) => t.bicortical).length ?? 0,
      largos: estado?.tornillos.filter((t) => t.puntaFueraMm > PUNTA_FUERA_MAXIMA_MM).length ?? 0,
      compresionMm,
    }
  }
  const porFragmento = tornillosPorFragmento(estado, opciones)
  return {
    placa: true,
    tornillos: estado.tornillos.length,
    bicorticales: estado.tornillos.filter((t) => t.bicortical).length,
    largos: estado.tornillos.filter((t) => t.puntaFueraMm > PUNTA_FUERA_MAXIMA_MM).length,
    compresionMm,
    ...(porFragmento ? { porFragmento } : {}),
  }
}
