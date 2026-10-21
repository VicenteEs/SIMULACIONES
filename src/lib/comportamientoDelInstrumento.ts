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
import { medidasDelClavoEnElNombre } from './enclavado'

export type PlanoDeCorte = 'piel' | 'musculo'

/** Cuánto separan las puntas de la Metzenbaum con las ramas abiertas del todo: lo que cabe entre ellas, unos 14 mm. */
export const ABERTURA_ROMA_DE_LA_METZENBAUM_MM = 14

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
    /** Es una aguja de Kirschner (P-005 E3): al retirar la perforación **se queda el alambre puesto** en vez de un túnel vacío. */
    alambre?: boolean
  } | null
  /** Cose: cada clic sobre el tejido suma un punto y el hilo queda dibujado entre ellos (D-169). */
  sutura: HiloDeSutura | null
  /** Se coloca sobre el hueso: una placa se apoya, un tornillo se pone en un agujero (D-169). */
  coloca: QueColoca | null
  /** Mide cuánto hueso hay bajo un agujero de la placa (el medidor de profundidad). */
  mide: boolean
  /**
   * Además de cortar, separa los planos **por tensión** sin cortarlos: la disección roma de la tijera de Metzenbaum.
   * Se mete la punta cerrada en el tejido, se abren las ramas, se avanza y se vuelve a abrir (petición de
   * Cristóbal). `maximoMm` es lo que separan las puntas con las ramas abiertas del todo.
   */
  roma: { maximoMm: number } | null
  /**
   * Toma un trozo de hueso y lo acompaña mientras se mueve: las pinzas de reducción (P-003 E5). Con la pinza en la mano
   * un clic en un trozo la deja agarrándolo; el trozo se mueve con las asas y la pinza va con él hasta soltarla.
   * `tipo` es la forma de las puntas: «puntas» (camarón o Weber), «garra» (Verbrugge) o «bola».
   */
  reduce: { tipo: 'puntas' | 'garra' | 'bola' } | null
  /**
   * Modela una placa fuera del hueso (P-005 E1): el alicate de tres puntos la **dobla** (flexión), las grifas la **tuercen** y la plantilla
   * maleable de aluminio copia el contorno del hueso para saber cómo hay que darle forma. Trabajan sobre la placa en la mesa de modelado.
   */
  modela: 'flexion' | 'torsion' | 'plantilla' | null
  /**
   * Despega el periostio de la cortical (P-005 E2): el Freer y los periostótomos. Con el instrumento en la mano, arrastrar sobre el hueso deja una franja de
   * hueso expuesto del ancho de la hoja. `anchosMm` son las hojas que ofrece (el Lambotte trae de 6 y de 14 mm).
   */
  eleva: { anchosMm: number[] } | null
  /**
   * Hace un paso del enclavado endomedular (P-005 E4): el punzón marca la **entrada**, la guía de punta de oliva pasa el canal, el dedo reductor ayuda a
   * pasarla por el foco, la fresa canulada ensancha el canal y el tubo de intercambio cambia la guía por una lisa. Y, ya con el canal listo (P-005 E5): el
   * **clavo** se mete, el **arco** se monta en él y el **martillo** o el **impactador** lo golpean hasta asentarlo. Las reglas están en `src/lib/enclavado.ts`.
   */
  enclava: 'entrada' | 'guia' | 'dedo' | 'fresa' | 'tubo' | 'clavo' | 'arco' | 'martillo' | 'impactador' | null
}

export type TipoDePinzaDeReduccion = 'puntas' | 'garra' | 'bola'

const NADA: ComportamientoDelInstrumento = {
  corta: null,
  separa: null,
  pellizca: null,
  electro: false,
  perfora: null,
  sutura: null,
  coloca: null,
  mide: false,
  roma: null,
  reduce: null,
  modela: null,
  eleva: null,
  enclava: null,
}

const POR_SLUG: Readonly<Record<string, ComportamientoDelInstrumento>> = {
  'bisturi-piel-n22': { ...NADA, corta: 'piel' },
  'bisturi-profundo-n15': { ...NADA, corta: 'musculo' },
  electrobisturi: { ...NADA, corta: 'musculo', electro: true },
  'tijera-mayo': { ...NADA, corta: 'musculo' },
  // La Metzenbaum se usa de dos maneras: cortando, como cualquier tijera, o en disección roma (se elige en el panel).
  'tijera-metzenbaum': { ...NADA, corta: 'musculo', roma: { maximoMm: ABERTURA_ROMA_DE_LA_METZENBAUM_MM } },

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

  // Las pinzas de reducción toman el hueso, no la piel: con ellas se lleva un fragmento a su sitio (P-003 E5).
  'pinza-reduccion-puntas': { ...NADA, reduce: { tipo: 'puntas' } },
  'pinza-reduccion-verbrugge': { ...NADA, reduce: { tipo: 'garra' } },
  'pinza-reduccion-bola': { ...NADA, reduce: { tipo: 'bola' } },

  // Periostio (P-005 E2)
  'elevador-freer': { ...NADA, eleva: { anchosMm: [3, 5] } },
  'periostotomo-lambotte': { ...NADA, eleva: { anchosMm: [6, 14] } },
  'periostotomo-farabeuf': { ...NADA, eleva: { anchosMm: [11, 15] } },

  // Modelado de placas (P-005 E1)
  'alicate-doblado': { ...NADA, modela: 'flexion' },
  'grifas-torsion': { ...NADA, modela: 'torsion' },
  'plantilla-aluminio': { ...NADA, modela: 'plantilla' },

  'aguja-kirschner': { ...NADA, perfora: { diametroMm: 1.6, avanceMmPorSegundo: 9, alambre: true } },
  'broca-1-5': { ...NADA, perfora: { diametroMm: 1.5, avanceMmPorSegundo: 9 } },
  'broca-2-0': { ...NADA, perfora: { diametroMm: 2.0, avanceMmPorSegundo: 9 } },
  'broca-2-5': { ...NADA, perfora: { diametroMm: 2.5, avanceMmPorSegundo: 9 } },
  'broca-3-2': { ...NADA, perfora: { diametroMm: 3.2, avanceMmPorSegundo: 9 } },
  'broca-3-5': { ...NADA, perfora: { diametroMm: 3.5, avanceMmPorSegundo: 9 } },
  'broca-4-5': { ...NADA, perfora: { diametroMm: 4.5, avanceMmPorSegundo: 8 } },
  avellanador: { ...NADA, perfora: { diametroMm: 6, avanceMmPorSegundo: 3 } },
  'machuelo-3-5': { ...NADA, perfora: { diametroMm: 3.5, avanceMmPorSegundo: 2 } },
  // Enclavado endomedular (P-005 E4). La fresa canulada ya no es una broca de 9 mm: se pasa por la guía y se sube de cabeza en cabeza.
  'punzon-iniciador': { ...NADA, enclava: 'entrada' },
  'guia-punta-oliva': { ...NADA, enclava: 'guia' },
  'dedo-reductor': { ...NADA, enclava: 'dedo' },
  'fresa-flexible': { ...NADA, enclava: 'fresa' },
  'tubo-intercambio': { ...NADA, enclava: 'tubo' },
  'arco-insercion': { ...NADA, enclava: 'arco' },
  martillo: { ...NADA, enclava: 'martillo' },
  'impactador-clavo': { ...NADA, enclava: 'impactador' },
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
  if (base.corta || base.separa || base.perfora || base.pellizca || base.reduce || base.enclava) return base
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
  if (/metzenbaum/.test(nombre)) {
    return { ...NADA, corta: 'musculo', roma: { maximoMm: ABERTURA_ROMA_DE_LA_METZENBAUM_MM } }
  }
  if (/bistur/.test(nombre) || i.icono === 'bisturi') {
    return { ...NADA, corta: /piel|\b(10|11|20|21|22)\b/.test(nombre) ? 'piel' : 'musculo' }
  }
  // Las de reducción antes que las de disección: «pinza de reducción con puntas» no es una pinza con dientes.
  if (/pinza.*reducci|reducci.*pinza|weber|camar[oó]n|verbrugge/.test(nombre)) {
    return { ...NADA, reduce: { tipo: /bola/.test(nombre) ? 'bola' : /verbrugge|garra/.test(nombre) ? 'garra' : 'puntas' } }
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
  if (/kirschner/.test(nombre)) {
    const d = /(\d+(?:[.,]\d+)?)\s*mm/i.exec(nombre)
    return { ...NADA, perfora: { diametroMm: d ? Number(d[1].replace(',', '.')) : 1.6, avanceMmPorSegundo: 9, alambre: true } }
  }
  if (/pun[zc][oó]n (iniciador|de entrada)|\bawl\b/.test(nombre)) return { ...NADA, enclava: 'entrada' }
  if (/gu[ií]a de punta de oliva|punta de oliva/.test(nombre)) return { ...NADA, enclava: 'guia' }
  if (/dedo reductor/.test(nombre)) return { ...NADA, enclava: 'dedo' }
  if (/fresa.*(flexible|canulada)|(flexible|canulada).*fresa/.test(nombre)) return { ...NADA, enclava: 'fresa' }
  if (/tubo de intercambio/.test(nombre)) return { ...NADA, enclava: 'tubo' }
  if (/arco de inserci[oó]n/.test(nombre)) return { ...NADA, enclava: 'arco' }
  if (/impactador/.test(nombre)) return { ...NADA, enclava: 'impactador' }
  if (/martillo/.test(nombre)) return { ...NADA, enclava: 'martillo' }
  // Un clavo endomedular se reconoce por sus medidas («Clavo tibial 9 × 330 mm»): es el implante que se mete por el canal.
  if (/^clavo/.test(nombre) && medidasDelClavoEnElNombre(i.nombre)) return { ...NADA, enclava: 'clavo' }
  if (/freer/.test(nombre)) return { ...NADA, eleva: { anchosMm: [3, 5] } }
  if (/periost[oó]tomo|elevador de periostio|lambotte/.test(nombre)) return { ...NADA, eleva: { anchosMm: [6, 14] } }
  if (/alicate.*dobla|dobla.*alicate|doblador/.test(nombre)) return { ...NADA, modela: 'flexion' }
  if (/grifa|bending iron|torsi[oó]n/.test(nombre) && !/limitador/.test(nombre)) return { ...NADA, modela: 'torsion' }
  if (/plantilla.*(aluminio|maleable)|maleable/.test(nombre)) return { ...NADA, modela: 'plantilla' }
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
  if (que.roma) {
    return 'La Metzenbaum se usa de dos maneras. Para cortar, como cualquier tijera: se traza la incisión. Para la disección roma —cuando se quiere ir con cuidado por haber estructuras delicadas— se elige «Disección roma»: se apoya la punta cerrada en el tejido con un clic, se abren las ramas con la rueda del ratón y el plano se separa por tensión, no por corte; después se avanza (otro clic más allá) y se vuelve a abrir, y así se va avanzando.'
  }
  if (que.corta === 'musculo') {
    return 'Aquí suele aparecer la fascia, un tejido transparente o rosado que envuelve a los músculos como un estuche: se corta con bisturí profundo o electrobisturí. Al llegar a los músculos se va separando hasta llegar al hueso.'
  }
  if (que.reduce) {
    return 'La pinza de reducción toma el hueso: con ella en la mano, un clic en un trozo la deja agarrándolo. Después se mueve el trozo con las flechas y los aros, mirando la fluoroscopia, y la pinza va con él hasta que se la suelta. Hace falta que el abordaje llegue hasta el hueso.'
  }
  if (que.pellizca) {
    return que.pellizca.conDientes
      ? 'Las pinzas de Adson van de a dos, una frente a la otra: un clic las coloca a los dos lados de la incisión (una la toma quien opera y la otra el ayudante) y pellizcan la piel hacia arriba. La rueda las separa o las junta, tirando de los bordes; con Mayúsculas, la rueda abre o cierra las mandíbulas. Así se da tensión para cortar la piel por completo.'
      : 'La pinza sin dientes toma tejidos delicados sin lesionarlos. Van de a dos, una frente a la otra, y pellizcan hacia arriba, pero no dan tensión a la piel: para eso se usan las de dientes.'
  }
  if (que.separa?.apoyoEnHueso) {
    return 'El Hohmann se apoya en el borde del hueso: haga clic sobre el hueso y retrae las partes blandas de ese lado. Se abre con la rueda del ratón o con la barra.'
  }
  if (que.separa?.autoestatico) {
    return 'Autoestático: se clava a los dos lados de la herida y se queda abierto solo, con su trinquete. Haga clic en el punto de la incisión donde quiere ponerlo y ábralo con la rueda del ratón o con la barra.'
  }
  if (que.separa) {
    return 'Una vez tomados los bordes y con el bisturí profundo, se meten los separadores y se llega a un plano más profundo. El Farabeuf y el Senn-Miller empujan la piel hacia un lado y hacia el otro, y se usan en pareja: uno por borde. Elija el plano —piel o músculo—, haga clic en la herida junto al borde que quiere sostener y ábralo con la rueda o con la barra. Para separar el músculo, baje al músculo un separador que ya esté puesto.'
  }
  return null
}
