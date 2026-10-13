/**
 * Qué le hace cada instrumento al paciente en el simulador (D-167).
 *
 * El catálogo dice qué es cada instrumento; esto dice qué *hace* cuando está en
 * la mano: si corta (y qué plano), si separa (y si se queda abierto solo) o si
 * perfora (y de qué calibre). Es una tabla y no un campo del catálogo por una
 * razón práctica: son las reglas del simulador, no datos que el traumatólogo
 * deba editar, y un instrumento nuevo que se cree desde el panel sin identificar
 * simplemente no hace nada, que es lo seguro.
 *
 * Se decide por `slug` (el identificador que también nombra el modelo 3D) y,
 * para lo que el panel haya creado a mano sin slug conocido, por el nombre.
 * Lo leen la consola, el lienzo y las pruebas.
 */

import { quePuedeColocar, sirveParaMedir, type QueColoca } from './fijacion'
import { hiloDelInstrumento, type HiloDeSutura } from './sutura'
import { esElectrobisturi } from './electrobisturi'

export type PlanoDeCorte = 'piel' | 'musculo'

export interface ComportamientoDelInstrumento {
  /** Corta al trazar. `piel` abre la piel; `musculo` los planos profundos (bajo la piel). */
  corta: PlanoDeCorte | null
  /** Separa los bordes de una herida. */
  separa: {
    /** Cuánto puede abrir como máximo, en mm. */
    maximoMm: number
    /** Se queda abierto solo (trinquete): ambos labios se separan por igual. */
    autoestatico: boolean
    /**
     * Se apoya en el borde del hueso y retrae lo blando de ese lado (el Hohmann).
     * Se coloca pinchando el **hueso**, no la herida.
     */
    apoyoEnHueso?: boolean
  } | null
  /**
   * Pellizca la piel hacia arriba: las pinzas de disección. Con dientes sujetan
   * sin resbalar y dan tensión a los bordes; sin dientes son para tejido delicado
   * y no tensan la piel.
   */
  pellizca: { conDientes: boolean } | null
  /** Es el electrobisturí: tiene potencia en vatios y modos de corte y coagulación. */
  electro: boolean
  /** Perfora: gira, avanza y deja un túnel. */
  perfora: {
    diametroMm: number
    /** Cuánto avanza por segundo con el motor, en mm. Un machuelo a mano va mucho más despacio. */
    avanceMmPorSegundo: number
  } | null
  /** Cose: cada clic sobre el tejido suma un punto y el hilo queda dibujado entre ellos (D-169). */
  sutura: HiloDeSutura | null
  /** Se coloca sobre el hueso: una placa se apoya, un tornillo se pone en un agujero (D-169). */
  coloca: QueColoca | null
  /** Mide cuánto hueso hay bajo un agujero de la placa (el medidor de profundidad). */
  mide: boolean
}

const NADA: ComportamientoDelInstrumento = {
  corta: null,
  separa: null,
  pellizca: null,
  electro: false,
  perfora: null,
  sutura: null,
  coloca: null,
  mide: false,
}

const POR_SLUG: Readonly<Record<string, ComportamientoDelInstrumento>> = {
  'bisturi-piel-n22': { ...NADA, corta: 'piel' },
  'bisturi-profundo-n15': { ...NADA, corta: 'musculo' },
  electrobisturi: { ...NADA, corta: 'musculo', electro: true },
  'tijera-mayo': { ...NADA, corta: 'musculo' },
  'tijera-metzenbaum': { ...NADA, corta: 'musculo' },

  // Los de mano los sostiene un ayudante o el propio cirujano: abren poco y solo
  // mientras alguien los sujeta. Los autoestáticos se quedan abiertos con su trinquete.
  'separador-senn-miller': { ...NADA, separa: { maximoMm: 22, autoestatico: false } },
  'separador-farabeuf': { ...NADA, separa: { maximoMm: 30, autoestatico: false } },
  // El Hohmann no se pone en la herida: se apoya en el borde del hueso y hace palanca sobre lo blando.
  'separador-hohmann': { ...NADA, separa: { maximoMm: 40, autoestatico: false, apoyoEnHueso: true } },
  'separador-gelpi': { ...NADA, separa: { maximoMm: 55, autoestatico: true } },
  'separador-weitlaner': { ...NADA, separa: { maximoMm: 65, autoestatico: true } },
  'separador-beckman-adson': { ...NADA, separa: { maximoMm: 90, autoestatico: true } },

  // Las pinzas de disección: pellizcan la piel hacia arriba. Con dientes tensan; sin dientes, no.
  'pinza-diseccion-con-dientes': { ...NADA, pellizca: { conDientes: true } },
  'pinza-diseccion-sin-dientes': { ...NADA, pellizca: { conDientes: false } },

  'broca-1-5': { ...NADA, perfora: { diametroMm: 1.5, avanceMmPorSegundo: 9 } },
  'broca-2-0': { ...NADA, perfora: { diametroMm: 2.0, avanceMmPorSegundo: 9 } },
  'broca-2-5': { ...NADA, perfora: { diametroMm: 2.5, avanceMmPorSegundo: 9 } },
  'broca-3-2': { ...NADA, perfora: { diametroMm: 3.2, avanceMmPorSegundo: 9 } },
  'broca-3-5': { ...NADA, perfora: { diametroMm: 3.5, avanceMmPorSegundo: 9 } },
  'broca-4-5': { ...NADA, perfora: { diametroMm: 4.5, avanceMmPorSegundo: 8 } },
  avellanador: { ...NADA, perfora: { diametroMm: 6, avanceMmPorSegundo: 3 } },
  'machuelo-3-5': { ...NADA, perfora: { diametroMm: 3.5, avanceMmPorSegundo: 2 } },
  'fresa-flexible': { ...NADA, perfora: { diametroMm: 9, avanceMmPorSegundo: 12 } },
}

/** «Broca AO 2,5 mm» → 2.5. Sin número reconocible, 3 mm: un calibre intermedio razonable. */
export function diametroEnElNombre(nombre: string): number {
  const m = /(\d+(?:[.,]\d+)?)\s*mm/i.exec(nombre)
  if (!m) return 3
  const valor = Number(m[1].replace(',', '.'))
  return Number.isFinite(valor) && valor > 0 && valor < 20 ? valor : 3
}

export function comportamientoDelInstrumento(i: {
  slug?: string | null
  nombre: string
  icono?: string | null
}): ComportamientoDelInstrumento {
  const base = sinSutura(i)
  // Un hilo no corta, no separa ni perfora: si el instrumento ya hace algo, no es una sutura.
  if (base.corta || base.separa || base.perfora || base.pellizca) return base
  const coloca = quePuedeColocar(i)
  const mide = sirveParaMedir(i)
  // Una placa o un tornillo no se confunden con un hilo, aunque su nombre diga «de sutura».
  return { ...base, coloca, mide, sutura: coloca || mide ? null : hiloDelInstrumento(i) }
}

function sinSutura(i: { slug?: string | null; nombre: string; icono?: string | null }): ComportamientoDelInstrumento {
  const conocido = i.slug ? POR_SLUG[i.slug] : undefined
  if (conocido) return conocido

  // Un instrumento creado a mano: se reconoce por lo que dice su nombre. Es la
  // red de seguridad, no la regla; lo que el catálogo base trae va en la tabla.
  const nombre = i.nombre.toLowerCase()
  if (esElectrobisturi(i)) return { ...NADA, corta: 'musculo', electro: true }
  if (/bistur/.test(nombre) || i.icono === 'bisturi') {
    return { ...NADA, corta: /piel|\b(10|11|20|21|22)\b/.test(nombre) ? 'piel' : 'musculo' }
  }
  if (/pinza de disecci|pinza.*adson|pinza.*dientes/.test(nombre) && !/reducci/.test(nombre)) {
    return { ...NADA, pellizca: { conDientes: /con dientes|dientes|adson|ratón|raton/.test(nombre) && !/sin dientes/.test(nombre) } }
  }
  if (/separador|retractor/.test(nombre)) {
    return {
      ...NADA,
      separa: {
        maximoMm: 30,
        autoestatico: /autoest|gelpi|weitlaner|beckman/.test(nombre),
        apoyoEnHueso: /hohmann/.test(nombre),
      },
    }
  }
  if (/broca/.test(nombre)) {
    return { ...NADA, perfora: { diametroMm: diametroEnElNombre(i.nombre), avanceMmPorSegundo: 9 } }
  }
  return NADA
}

/**
 * Lo que se le dice al residente sobre el uso de cada instrumento, tal como lo
 * cuenta el traumatólogo (Cristóbal): el orden del abordaje y qué hace cada cosa
 * con el tejido. Es la guía que acompaña al instrumento en la mano; la
 * `descripcion` del catálogo dice qué es, esto dice **cómo se usa en el abordaje**.
 *
 * Va aquí y no en el catálogo porque lo editable del catálogo es lo que el panel
 * deja tocar, y esto es una regla del simulador: si un editor reescribe la
 * descripción de «Pinza de disección», la secuencia del abordaje no debe
 * desaparecer con ella.
 */
export function guiaDelInstrumento(i: { slug?: string | null; nombre: string; icono?: string | null }): string | null {
  const que = comportamientoDelInstrumento(i)
  if (que.electro) {
    return 'Una vez tomados los bordes de la piel con las pinzas, ya no se usa el bisturí de piel: se sigue con bisturí profundo o con electrobisturí. En sitios más vascularizados se usa en modo coagulación (azul, COAG); para cortar, modo corte (amarillo, CUT). La potencia se gradúa en vatios, de 0 a 100.'
  }
  if (que.corta === 'piel') {
    return 'Solo la primera incisión, la de la piel, se hace con bisturí de piel. Después se toman los bordes con pinzas y se sigue con bisturí profundo o electrobisturí.'
  }
  if (que.corta === 'musculo' && /metzenbaum/i.test(`${i.slug ?? ''} ${i.nombre}`)) {
    return 'Otra opción para llegar a los planos profundos es meterse con la tijera de Metzenbaum cerrada y, a medida que se avanza, ir abriéndola (con la rueda del ratón). Se hace cuando se quiere ir con cuidado por haber estructuras delicadas.'
  }
  if (que.corta === 'musculo') {
    return 'Aquí suele aparecer la fascia, un tejido transparente o rosado que envuelve a los músculos como un estuche: se corta con bisturí profundo o electrobisturí. Al llegar a los músculos se va separando hasta llegar al hueso.'
  }
  if (que.pellizca) {
    return que.pellizca.conDientes
      ? 'Tras la incisión de la piel se toman los bordes con pinzas con dientes: una la toma quien opera y la otra el ayudante. Así se da tensión para cortar la piel por completo. La pinza pellizca la piel hacia arriba.'
      : 'La pinza sin dientes toma tejidos delicados sin lesionarlos. Pellizca hacia arriba, pero no da tensión a la piel: para eso se usan las de dientes.'
  }
  if (que.separa?.apoyoEnHueso) {
    return 'El Hohmann se apoya en el borde del hueso: haga clic sobre el hueso y retrae las partes blandas de ese lado. Se abre con la rueda del ratón o con la barra.'
  }
  if (que.separa?.autoestatico) {
    return 'Autoestático: se clava a los dos lados de la herida y se queda abierto solo, con su trinquete. Haga clic en el punto de la incisión donde quiere ponerlo y ábralo con la rueda del ratón o con la barra.'
  }
  if (que.separa) {
    return 'Una vez tomados los bordes y con el bisturí profundo, se meten los separadores y se llega a un plano más profundo. El Farabeuf y el Senn-Miller empujan la piel hacia un lado y hacia el otro, y se usan en pareja: uno por borde. Haga clic en la herida, junto al borde que quiere sostener, y ábralo con la rueda o con la barra.'
  }
  return null
}
