/**
 * El cierre por planos: cada sutura agarra el plano que le toca, y cada plano se cierra con sus puntadas (P-006, E11).
 *
 * Cristóbal, después de operar: «tuve problemas para suturar. Me daba alarma de que mi cierre estaba muy distanciado. El
 * vicryl debe ir a la fascia, que todavía no la incluimos». La sutura de D-169 cosía **sobre la piel** y medía la distancia
 * entre puntadas sin saber qué plano tenía debajo: con dos heridas abiertas —piel y fascia— el mismo hilo cerraba las dos a
 * la vez, y un cierre de fascia «muy distanciado» no se podía ni ver ni medir.
 *
 * Aquí está lo que decide el plano de cada puntada, qué hilo va a qué plano, y cómo se mide y se cierra **cada plano por su
 * cuenta**. Es puro, sin `three`: son cuentas que se pueden equivocar sin que se note (una puntada de nailon que «cierra» la
 * fascia, una distancia medida entre dos puntadas de planos distintos) y que se prueban mejor con números que con una escena.
 *
 * ## Cuándo vale
 *
 * Solo en un caso que **trae fascia** (alguna pieza con ese papel). Un caso viejo, sin ella, sigue cerrando como antes —todas
 * las heridas con todas las puntadas—, porque sin fascia no hay plano intermedio que distinguir y lo que hacían sus pasos
 * seguiría valiendo.
 */

import {
  SEPARACION_IDEAL_MM,
  cierreConTension,
  cierreDeLaHerida,
  medirLaSutura,
  type HiloDeSutura,
  type MedidaDeLaSutura,
  type PuntoDeSutura,
  type SeparacionIdeal,
} from './sutura'
import { NOMBRE_DEL_PLANO, planoDelRol, type PlanoBlando } from './planosBlandos'

/**
 * Qué heridas cierra una sutura puesta en cada plano.
 *
 * La fascia sostiene al músculo que tiene debajo: cerrarla cierra también la herida del plano muscular, que nadie sutura.
 * La piel solo cierra la piel.
 */
export const HERIDAS_QUE_CIERRA: Readonly<Record<PlanoBlando, readonly PlanoBlando[]>> = {
  piel: ['piel'],
  fascia: ['fascia', 'musculo'],
  musculo: ['musculo'],
}

/** Los planos que hay que cerrar para dar por cerrada la herida: el muscular no se sutura, lo cierra la fascia. */
export const PLANOS_QUE_EXIGE_EL_CIERRE: readonly PlanoBlando[] = ['piel', 'fascia']

/**
 * Entre qué separaciones una puntada está bien puesta en cada plano, en mm.
 *
 * La piel es la de siempre (5 a 10). **La fascia es provisional, de 8 a 15 mm**: un punto de fascia agarra más tejido y
 * se separa más que uno de piel, pero Cristóbal no ha dicho cuánto («me daba alarma de que mi cierre estaba muy
 * distanciado»), y es una de las preguntas abiertas de P-006 (P4-Q3). El músculo no se sutura: el rango es el de la fascia
 * y no se usa.
 */
export const SEPARACION_IDEAL_POR_PLANO: Readonly<Record<PlanoBlando, SeparacionIdeal>> = {
  piel: SEPARACION_IDEAL_MM,
  fascia: { min: 8, max: 15 },
  musculo: { min: 8, max: 15 },
}

/** El plano de una puntada por el papel de la pieza donde cayó. Sin papel conocido, la piel: es lo que había antes. */
export function planoDeLaPuntada(rol: string | undefined | null): PlanoBlando {
  return planoDelRol(rol) ?? 'piel'
}

export interface JuicioDelPlano {
  /** La puntada vale: se suma a la sutura. */
  acepta: boolean
  /** Lo que se le dice a quien cosió, o `null` si estuvo bien. */
  texto: string | null
}

/**
 * ¿Este hilo va en este plano?
 *
 * Un hilo sin planos declarados (uno creado a mano en el panel) va donde sea: no se juzga lo que no se sabe. El músculo no
 * se sutura con ningún hilo: el cierre profundo es el de la fascia que lo cubre.
 */
export function juicioDelHiloEnElPlano(hilo: Pick<HiloDeSutura, 'nombre' | 'planos'>, plano: PlanoBlando): JuicioDelPlano {
  if (plano === 'musculo') {
    return {
      acepta: false,
      texto: 'El músculo no se sutura: el cierre profundo es el de la fascia que lo cubre. Pique en la fascia.',
    }
  }
  if (!hilo.planos || hilo.planos.length === 0 || hilo.planos.includes(plano)) return { acepta: true, texto: null }
  if (plano === 'piel') {
    return {
      acepta: false,
      texto: `${hilo.nombre} va a la fascia: esta puntada cayó en la piel y no cuenta. Con la piel abierta se ve la fascia debajo; pique ahí.`,
    }
  }
  return {
    acepta: false,
    texto: `${hilo.nombre} es de piel: en la fascia va Vicryl. La puntada no cuenta; cambie de hilo.`,
  }
}

/** Qué puntos son de qué plano. Un punto sin plano (lo guardado antes de que hubiera planos) es de la piel. */
export function repartirPorPlanos(puntos: readonly PuntoDeSutura[]): Map<PlanoBlando, PuntoDeSutura[]> {
  const grupos = new Map<PlanoBlando, PuntoDeSutura[]>()
  for (const p of puntos) {
    const plano = p.plano ?? 'piel'
    const lista = grupos.get(plano) ?? []
    // El primero de cada plano abre una línea: el tramo entre dos puntos de planos distintos no es una puntada.
    lista.push(lista.length === 0 ? { ...p, nuevaLinea: true } : p)
    grupos.set(plano, lista)
  }
  return grupos
}

/** Las medidas de cada plano por su cuenta: puntadas, cruces, separación media, las bien espaciadas. */
export function medirPorPlanos(
  puntos: readonly PuntoDeSutura[],
  milimetrosPorUnidad: number,
): Partial<Record<PlanoBlando, MedidaDeLaSutura>> {
  const salida: Partial<Record<PlanoBlando, MedidaDeLaSutura>> = {}
  for (const [plano, lista] of repartirPorPlanos(puntos)) {
    salida[plano] = medirLaSutura(lista, milimetrosPorUnidad, SEPARACION_IDEAL_POR_PLANO[plano])
  }
  return salida
}

export interface CierreDeUnPlano {
  /** Lo que se cierra con la tensión que hay, de 0 a 1. */
  cierre: number
  /** Lo que las puntadas que hay podrían cerrar con tensión de sobra, de 0 a 1. */
  cierreMaximo: number
}

/**
 * Cuánto cierra la sutura de cada plano su herida, con su propia tensión: una herida de 10 cm de fascia con tres puntadas
 * queda cerrada a un tercio, y la piel de encima se mide aparte. `largosMm` solo trae los planos que **tienen herida**.
 */
export function cierresPorPlano(
  porPlano: Partial<Record<PlanoBlando, MedidaDeLaSutura>>,
  largosMm: Partial<Record<PlanoBlando, number>>,
  tensiones: Partial<Record<PlanoBlando, number>>,
): Partial<Record<PlanoBlando, CierreDeUnPlano>> {
  const salida: Partial<Record<PlanoBlando, CierreDeUnPlano>> = {}
  for (const plano of Object.keys(largosMm) as PlanoBlando[]) {
    const cruces = porPlano[plano]?.cruces ?? 0
    const largo = largosMm[plano] ?? 0
    const tramo = SEPARACION_IDEAL_POR_PLANO[plano].max
    salida[plano] = {
      cierre: cierreConTension(cruces, largo, tensiones[plano] ?? 0, tramo),
      cierreMaximo: cierreDeLaHerida(cruces, largo, tramo),
    }
  }
  return salida
}

/**
 * Cuánto se cierra la herida de cada plano, dado lo que cerró la sutura de cada uno: la de la fascia cierra también la
 * herida del músculo (`HERIDAS_QUE_CIERRA`). Donde dos suturas llegan a la misma herida manda la que más cierra.
 */
export function cierreDeCadaHerida(
  cierres: Partial<Record<PlanoBlando, CierreDeUnPlano>>,
  heridas: readonly PlanoBlando[],
): Partial<Record<PlanoBlando, number>> {
  const salida: Partial<Record<PlanoBlando, number>> = {}
  for (const herida of heridas) {
    let mejor = 0
    for (const [plano, c] of Object.entries(cierres) as [PlanoBlando, CierreDeUnPlano][]) {
      if (HERIDAS_QUE_CIERRA[plano].includes(herida)) mejor = Math.max(mejor, c.cierre)
    }
    salida[herida] = mejor
  }
  return salida
}

/**
 * Cuánto está cerrada la herida **entera**: el plano menos cerrado de los que hay que cerrar (la piel y la fascia, si
 * tienen herida). Con la piel cosida y la fascia abierta no está cerrada: es justo el cierre que alarmó a Cristóbal.
 */
export function cierreDeTodoElCierre(
  cierres: Partial<Record<PlanoBlando, number>>,
  heridas: readonly PlanoBlando[],
): number {
  const exigidos = PLANOS_QUE_EXIGE_EL_CIERRE.filter((p) => heridas.includes(p))
  if (exigidos.length === 0) return 0
  return Math.min(...exigidos.map((p) => cierres[p] ?? 0))
}

export interface ResumenDeUnPlano {
  plano: PlanoBlando
  /** «Piel», «Fascia», «Planos profundos». */
  nombre: string
  puntadas: number
  cruces: number
  tramos: number
  separacionMediaMm: number
  bienEspaciadas: number
  /** Si este plano tiene herida abierta en la escena: sin ella, cerrar no significa nada. */
  conHerida: boolean
  cierre: number
  cierreMaximo: number
  tension: number
}

/** El resumen de cada plano donde hay puntadas o herida, en orden de la superficie hacia dentro. */
export function resumirPorPlanos(
  porPlano: Partial<Record<PlanoBlando, MedidaDeLaSutura>>,
  cierres: Partial<Record<PlanoBlando, CierreDeUnPlano>>,
  tensiones: Partial<Record<PlanoBlando, number>>,
  heridas: readonly PlanoBlando[],
): ResumenDeUnPlano[] {
  const planos: PlanoBlando[] = (['piel', 'fascia', 'musculo'] as const).filter(
    (p) => porPlano[p] !== undefined || heridas.includes(p),
  )
  return planos.map((plano) => {
    const m = porPlano[plano]
    return {
      plano,
      nombre: NOMBRE_DEL_PLANO[plano],
      puntadas: m?.puntadas ?? 0,
      cruces: m?.cruces ?? 0,
      tramos: m?.tramos ?? 0,
      separacionMediaMm: m?.separacionMediaMm ?? 0,
      bienEspaciadas: m?.bienEspaciadas ?? 0,
      conHerida: heridas.includes(plano),
      cierre: cierres[plano]?.cierre ?? 0,
      cierreMaximo: cierres[plano]?.cierreMaximo ?? 0,
      tension: tensiones[plano] ?? 0,
    }
  })
}
