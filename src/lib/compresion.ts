/**
 * La compresión de una fractura: el orificio oval, el tornillo excéntrico y las dos técnicas de tracción (P-004 E10, pedidos 11 y
 * 14 de Cristóbal). Es **la parte clínica más delicada de la ronda**, y por eso las cuentas viven aquí, en un módulo puro y legible,
 * y no dentro del lienzo: Cristóbal las puede leer y corregir sin tocar nada de la escena.
 *
 * Lo que dice el documento:
 *
 * - En una placa con **orificios ovalados**, un tornillo **excéntrico** deja que el hueso se deslice y se apriete contra el otro
 *   fragmento. Al brocar se elige la posición del tornillo respecto del orificio: **céntrico** (no comprime), **concéntrico hacia la
 *   fractura** (no comprime) o **excéntrico, más lejos de la fractura** (comprime).
 * - Un tornillo de tracción comprime de **dos formas**: brocando **grande** el fragmento cercano y **chico** el lejano (el tornillo
 *   desliza por el cercano y arrastra al otro), o con un tornillo de **rosca parcial** (desliza en el cercano y empuja contra el otro).
 *
 * Las suposiciones que hay que validar con él están en `BITACORA.md` (S6, Q3): el óvalo se parte en tres zonas por su distancia a la
 * fractura, y cada tornillo comprime como mucho **1 mm**, que es lo de una DCP.
 *
 * Es puro y sin three: se prueba con números.
 */

import { calibreDeBrocaParaElTornillo } from './fijacion'

/** Cuánto comprime, como máximo, un tornillo (el de una placa de compresión dinámica), en mm. */
export const COMPRESION_MAXIMA_POR_TORNILLO_MM = 1

/** Un número con un decimal y coma, para decirlo en pantalla. */
const coma = (n: number) => n.toFixed(1).replace('.', ',')

/** La tolerancia al comparar calibres de broca, en mm. */
const TOLERANCIA_DEL_CALIBRE_MM = 0.05

export type TecnicaDeCompresion = 'excentrico' | 'deslizamiento' | 'rosca-parcial'

export interface ResultadoDeCompresion {
  /** Cuánto comprime, en mm; 0 si no comprime. */
  mm: number
  tecnica: TecnicaDeCompresion | null
  /** Lo que se le dice a quien lo hizo: por qué comprime o por qué no. */
  texto: string
}

// ---------------------------------------------------------------------------------- el orificio oval

export type FormaDelAgujero = 'redondo' | 'oval' | 'combi'

/**
 * La forma de los orificios de una placa, deducida de su nombre mientras el modelo no la declare: las de compresión dinámica (DCP,
 * LC-DCP) llevan óvalos; las bloqueadas (LCP), orificios combinados, que admiten un tornillo normal en la parte oval; el resto,
 * redondos.
 */
export function formaDeLosAgujeros(i: { slug?: string | null; nombre?: string | null }): FormaDelAgujero {
  const texto = `${i.slug ?? ''} ${i.nombre ?? ''}`.toLowerCase()
  if (/\blcp\b|lcp[-_ ]/.test(texto) && !/dcp/.test(texto)) return 'combi'
  if (/dcp/.test(texto)) return 'oval'
  return 'redondo'
}

/**
 * El diámetro del tornillo para el que está hecho el óvalo de una placa, sacado del primer «4,5» o «3,5» de su nombre. Sin número, el
 * de 4,5 de una placa ancha. El óvalo de una DCP 4,5 mide 9 mm y el de una LC-DCP 3,5, 7.
 */
export function diametroDelTornilloDeLaPlaca(nombreDeLaPlaca: string): number {
  const m = /(\d)[,.](\d)/.exec(nombreDeLaPlaca)
  return m ? Number(`${m[1]}.${m[2]}`) : 4.5
}

/** El semilargo del óvalo de una placa, en mm: la mitad del doble del diámetro de su tornillo. */
export function semilargoDelOvalDeLaPlaca(nombreDeLaPlaca: string): number {
  return largoDelOvalMm(diametroDelTornilloDeLaPlaca(nombreDeLaPlaca)) / 2
}

/** El largo de un orificio oval por omisión: el doble del diámetro del tornillo. */
export function largoDelOvalMm(diametroDelTornilloMm: number): number {
  return Math.round(2 * diametroDelTornilloMm * 10) / 10
}

export type ZonaDelOval = 'cerca-de-la-fractura' | 'centro' | 'lejos-de-la-fractura'

/** La fracción del semilargo del óvalo que se cuenta como «el centro»: el quinto de cada lado. */
export const FRACCION_DEL_CENTRO = 0.2

/**
 * En qué zona del óvalo cayó la broca. `desviacionMm` es lo que se corrió del centro, con signo y a lo largo de la placa;
 * `ladoDeLaFractura` es hacia qué sentido de ese mismo eje está la fractura (1 hacia el lado positivo, −1 hacia el negativo).
 * «Hacia la fractura» es la desviación vista desde la fractura: positiva si se corrió hacia ella.
 */
export function zonaDelOval(desviacionMm: number, ladoDeLaFractura: 1 | -1, semilargoMm: number): ZonaDelOval {
  const haciaLaFractura = desviacionMm * ladoDeLaFractura
  if (Math.abs(haciaLaFractura) <= FRACCION_DEL_CENTRO * semilargoMm) return 'centro'
  return haciaLaFractura > 0 ? 'cerca-de-la-fractura' : 'lejos-de-la-fractura'
}

/** El nombre clínico de cada zona, para decirlo en pantalla. */
export const NOMBRE_DE_LA_ZONA: Record<ZonaDelOval, string> = {
  'cerca-de-la-fractura': 'concéntrico hacia la fractura',
  centro: 'céntrico',
  'lejos-de-la-fractura': 'excéntrico, lejos de la fractura',
}

/**
 * Qué compresión da un tornillo puesto en un orificio oval según donde se brocó. **Solo el excéntrico, lejos de la fractura,
 * comprime**: hasta `COMPRESION_MAXIMA_POR_TORNILLO_MM`, que se alcanza con una excentricidad de medio milímetro (`2 × excentricidad`).
 * Cerca de la fractura no comprime y, además, tiende a separar los fragmentos al apretarse; en el centro, es neutro.
 */
export function resultadoDelOval(desviacionMm: number, ladoDeLaFractura: 1 | -1, semilargoMm: number): ResultadoDeCompresion {
  const zona = zonaDelOval(desviacionMm, ladoDeLaFractura, semilargoMm)
  const excentricidad = Math.abs(desviacionMm)
  if (zona === 'lejos-de-la-fractura') {
    const mm = Math.min(COMPRESION_MAXIMA_POR_TORNILLO_MM, Math.round(2 * excentricidad * 100) / 100)
    return {
      mm,
      tecnica: 'excentrico',
      texto: `Tornillo ${NOMBRE_DE_LA_ZONA[zona]}: comprime ${coma(mm)} mm.`,
    }
  }
  if (zona === 'cerca-de-la-fractura') {
    return {
      mm: 0,
      tecnica: null,
      texto: `Tornillo ${NOMBRE_DE_LA_ZONA[zona]}: no comprime y tiende a separar los fragmentos. Para comprimir se broca lejos de la fractura.`,
    }
  }
  return { mm: 0, tecnica: null, texto: 'Tornillo céntrico: no comprime. Para comprimir se broca excéntrico, lejos de la fractura.' }
}

/**
 * Hacia qué sentido del eje de la placa está la fractura respecto de un orificio: `posicionDelAgujeroMm` y
 * `posicionDeLaFracturaMm` son coordenadas a lo largo de ese eje. Con la fractura justo sobre el orificio no hay lado y se toma el
 * positivo, que es lo mismo que decir que ahí todo es «centro».
 */
export function ladoDeLaFractura(posicionDelAgujeroMm: number, posicionDeLaFracturaMm: number): 1 | -1 {
  return posicionDeLaFracturaMm >= posicionDelAgujeroMm ? 1 : -1
}

// ---------------------------------------------------------------------- la broca de deslizamiento

/** Lo que se perforó por una trayectoria: el calibre y hasta dónde llegó, contado desde la entrada. */
export interface PerforacionDeLaTrayectoria {
  diametroMm: number
  profundidadMm: number
}

/**
 * Los calibres con que quedó perforado cada fragmento, a partir de lo perforado por la trayectoria y de a qué distancia de la
 * entrada la cruza la fractura (`distanciaALaFracturaMm`). El **cercano** es lo que va de la entrada a la fractura: lo que se
 * perforó con la broca **más grande** que pasó por ahí. El **lejano** es lo que hay más allá: lo perforado por una broca que
 * llegó más lejos que la fractura (la más chica, si hubo dos). `null`: ese fragmento no se perforó.
 */
export function calibresPorFragmento(
  perforaciones: readonly PerforacionDeLaTrayectoria[],
  distanciaALaFracturaMm: number,
): { cercanoMm: number | null; lejanoMm: number | null } {
  const alCercano = perforaciones.filter((p) => p.profundidadMm > 0.5)
  const alLejano = perforaciones.filter((p) => p.profundidadMm > distanciaALaFracturaMm + 0.5)
  return {
    cercanoMm: alCercano.length > 0 ? Math.max(...alCercano.map((p) => p.diametroMm)) : null,
    lejanoMm: alLejano.length > 0 ? Math.min(...alLejano.map((p) => p.diametroMm)) : null,
  }
}

/**
 * La técnica de la broca de deslizamiento: el fragmento **cercano** perforado con un calibre **no menor que el diámetro exterior**
 * del tornillo (la rosca no agarra ahí y el tornillo desliza) y el **lejano** con el calibre de **núcleo** (la rosca agarra y arrastra al
 * otro). Si el lejano queda más ancho que el núcleo, la rosca no agarra en ninguno; si el cercano queda justo, agarra en los dos y
 * mantiene la separación.
 */
export function resultadoDelDeslizamiento(p: {
  cercanoMm: number | null
  lejanoMm: number | null
  diametroExteriorMm: number
}): ResultadoDeCompresion {
  const nucleo = calibreDeBrocaParaElTornillo(p.diametroExteriorMm)
  const f = (n: number) => String(n).replace('.', ',')
  if (p.cercanoMm === null || p.lejanoMm === null) {
    return {
      mm: 0,
      tecnica: null,
      texto: 'Falta perforar uno de los dos fragmentos: para comprimir con la broca de deslizamiento, el cercano con la grande y el lejano con la de núcleo.',
    }
  }
  const cercanoDesliza = p.cercanoMm >= p.diametroExteriorMm - TOLERANCIA_DEL_CALIBRE_MM
  const lejanoAgarra = Math.abs(p.lejanoMm - nucleo) <= TOLERANCIA_DEL_CALIBRE_MM
  if (cercanoDesliza && lejanoAgarra) {
    return {
      mm: COMPRESION_MAXIMA_POR_TORNILLO_MM,
      tecnica: 'deslizamiento',
      texto: `Broca de deslizamiento: el cercano con Ø ${f(p.cercanoMm)} mm (desliza) y el lejano con Ø ${f(p.lejanoMm)} mm (agarra): comprime ${coma(COMPRESION_MAXIMA_POR_TORNILLO_MM)} mm.`,
    }
  }
  if (!cercanoDesliza) {
    return {
      mm: 0,
      tecnica: null,
      texto: `No comprime: el fragmento cercano se perforó con Ø ${f(p.cercanoMm)} mm y la rosca agarra ahí. Para que el tornillo deslice, el cercano va con Ø ${f(p.diametroExteriorMm)} mm o más.`,
    }
  }
  return {
    mm: 0,
    tecnica: null,
    texto: `No comprime: el fragmento lejano se perforó con Ø ${f(p.lejanoMm)} mm y el núcleo es de ${f(nucleo)} mm: la rosca no agarra. El lejano va con Ø ${f(nucleo)} mm.`,
  }
}

// ---------------------------------------------------------------------------------- la rosca parcial

/**
 * La técnica del tornillo de **rosca parcial**: la rosca ocupa los últimos `roscaMm` de la punta. Comprime si **toda la rosca** queda
 * en el fragmento lejano, o sea, si la parte lisa llega hasta más allá de la fractura (`largoMm − roscaMm ≥ distancia`). Si la rosca
 * **cruza la fractura** agarra en los dos fragmentos y no comprime; si el tornillo ni siquiera la alcanza, tampoco.
 */
export function resultadoDeLaRoscaParcial(p: {
  roscaMm: number
  largoMm: number
  distanciaALaFracturaMm: number
}): ResultadoDeCompresion {
  const f = (n: number) => String(Math.round(n)).replace('.', ',')
  if (p.largoMm <= p.distanciaALaFracturaMm) {
    return { mm: 0, tecnica: null, texto: 'No comprime: el tornillo no llega a la fractura, es demasiado corto.' }
  }
  const empiezaLaRosca = p.largoMm - p.roscaMm
  if (empiezaLaRosca >= p.distanciaALaFracturaMm - 0.5) {
    return {
      mm: COMPRESION_MAXIMA_POR_TORNILLO_MM,
      tecnica: 'rosca-parcial',
      texto: `Rosca parcial: toda la rosca (${f(p.roscaMm)} mm) queda en el fragmento lejano y la parte lisa desliza en el cercano: comprime ${coma(COMPRESION_MAXIMA_POR_TORNILLO_MM)} mm.`,
    }
  }
  return {
    mm: 0,
    tecnica: null,
    texto: `No comprime: la rosca (${f(p.roscaMm)} mm) cruza la fractura —empieza a ${f(empiezaLaRosca)} mm y la fractura está a ${f(p.distanciaALaFracturaMm)} mm— y agarra en los dos fragmentos. Hace falta un tornillo más largo, o con la rosca más corta.`,
  }
}

/** Las mismas cuentas se resumen así en el estado: cuánto se comprimió en total y con qué técnicas. */
export interface CompresionTotal {
  mm: number
  tecnicas: TecnicaDeCompresion[]
}

export function sumarCompresion(anterior: CompresionTotal, resultado: ResultadoDeCompresion): CompresionTotal {
  if (resultado.mm <= 0 || !resultado.tecnica) return anterior
  const tecnicas = anterior.tecnicas.includes(resultado.tecnica) ? anterior.tecnicas : [...anterior.tecnicas, resultado.tecnica]
  return { mm: Math.round((anterior.mm + resultado.mm) * 100) / 100, tecnicas }
}

export const NOMBRE_DE_LA_TECNICA: Record<TecnicaDeCompresion, string> = {
  excentrico: 'tornillo excéntrico',
  deslizamiento: 'broca de deslizamiento',
  'rosca-parcial': 'rosca parcial',
}

/**
 * Cuánto puede bajar la diástasis con una compresión: no se comprime más de lo que hay separado. `diastasisMm` es lo que mide el motor
 * de la reducción; sin separación, no hay nada que comprimir y el fragmento no se mueve.
 */
export function compresionAplicable(compresionMm: number, diastasisMm: number): number {
  return Math.max(0, Math.min(compresionMm, diastasisMm))
}
