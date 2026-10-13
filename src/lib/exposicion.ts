/**
 * La exposición del campo: pinzas que tensan la piel y separadores colocados en
 * la herida (petición de Cristóbal).
 *
 * Es la parte aritmética de cómo se manejan en pabellón, separada del lienzo para
 * poder probarla sin navegador:
 *
 * - **La pinza con dientes pellizca la piel hacia arriba.** Dos —una la toma quien
 *   opera, la otra el ayudante— dan tensión a los bordes, que es lo que permite
 *   cortar la piel por completo; solo la primera incisión es con bisturí de piel.
 * - **El Farabeuf y el Senn-Miller empujan la piel hacia un lado** (y el otro): son
 *   de mano, uno por labio, y se usan en pareja. **El Hohmann se apoya en el borde
 *   del hueso** y retrae lo blando de ese lado. **Los autoestáticos** (Gelpi,
 *   Weitlaner, Beckman-Adson) se clavan a los dos lados y se quedan abiertos solos.
 *
 * Se elige el separador, se hace clic en el punto de la incisión donde se quiere
 * poner y se abre con la rueda —o con una barra deslizante, que es lo que hay en
 * una tableta—. La apertura no es pareja a lo largo de toda la herida: se abre
 * donde está el separador y se va cerrando hacia los extremos, como la piel de
 * verdad, y eso es lo que calcula `aperturaEnLaPosicion`.
 */

/** Cómo actúa cada tipo de separador. */
export type TipoDeSeparador = 'mano' | 'autoestatico' | 'palanca'

export interface SeparadorColocado {
  id: number
  /** El instrumento del catálogo, para volver a dibujarlo y para decirlo en pantalla. */
  instrumentoId: string
  nombre: string
  tipo: TipoDeSeparador
  /** A qué labio de la herida se agarra: +1, −1, o 0 si abraza los dos (autoestático). */
  lado: 1 | -1 | 0
  /** Dónde está a lo largo de la incisión, de 0 (inicio) a 1 (final). */
  posicion: number
  /** Hasta dónde puede abrir, en milímetros. */
  maximoMm: number
  /** Cuánto lleva abierto, en milímetros. */
  aperturaMm: number
}

/** La anchura, como fracción del largo de la herida, de la zona que abre cada tipo. */
export const ALCANCE_POR_TIPO: Readonly<Record<TipoDeSeparador, number>> = {
  // Una hoja sola tira de un tramo corto de piel.
  mano: 0.22,
  // Los rastrillos se clavan y arrastran un tramo largo.
  autoestatico: 0.4,
  // La palanca retrae músculo y no piel: su zona es ancha y blanda.
  palanca: 0.3,
}

export function tipoDelSeparador(separa: { autoestatico: boolean; apoyoEnHueso?: boolean }): TipoDeSeparador {
  if (separa.apoyoEnHueso) return 'palanca'
  return separa.autoestatico ? 'autoestatico' : 'mano'
}

/** Cuántos separadores caben a la vez: más no entran en una herida de abordaje. */
export const MAXIMO_DE_SEPARADORES = 6

/**
 * Cuánto abre cada labio en un punto de la herida, en milímetros.
 *
 * Cada separador abre en forma de campana alrededor de donde está; donde dos se
 * solapan manda el que más abre (no se suman: dos hojas a la vez no abren el doble
 * de lo que abre cada una en ese punto). `posicion` es 0 al inicio y 1 al final.
 */
export function aperturaEnLaPosicion(
  separadores: readonly SeparadorColocado[],
  posicion: number,
): { mas: number; menos: number } {
  let mas = 0
  let menos = 0
  for (const s of separadores) {
    const sigma = ALCANCE_POR_TIPO[s.tipo]
    const d = (posicion - s.posicion) / sigma
    const campana = Math.exp(-0.5 * d * d)
    const abre = Math.max(0, s.aperturaMm) * campana
    if (s.lado >= 0) mas = Math.max(mas, abre)
    if (s.lado <= 0) menos = Math.max(menos, abre)
  }
  return { mas, menos }
}

/** La apertura máxima de la herida, en milímetros: lo que dice el panel. */
export function aperturaMaxima(separadores: readonly SeparadorColocado[]): number {
  let mayor = 0
  for (const s of separadores) mayor = Math.max(mayor, s.aperturaMm * (s.lado === 0 ? 2 : 1))
  return mayor
}

/** Un valor de apertura que respeta el tope del separador y los milímetros enteros. */
export const limitarApertura = (mm: number, maximoMm: number): number =>
  Math.min(maximoMm, Math.max(0, Math.round(mm)))

/**
 * A qué labio se agarra una hoja de mano según de qué lado de la incisión se
 * hizo clic. Una hoja de mano abre solo el borde que sostiene; el otro lo
 * sostiene otro (el ayudante, u otra hoja).
 */
export function ladoAlColocar(tipo: TipoDeSeparador, ladoDelClic: 1 | -1): 1 | -1 | 0 {
  return tipo === 'autoestatico' ? 0 : ladoDelClic
}

// ---------------------------------------------------------------- pinzas

export interface Pellizco {
  id: number
  /** Si la pinza lleva dientes: con ellos la piel no se resbala y se puede tensar. */
  conDientes: boolean
  /** A qué labio de la herida sostiene: +1, −1, o 0 si no hay herida todavía. */
  lado: 1 | -1 | 0
  /** Cuánto levanta la piel, en milímetros. */
  alturaMm: number
}

export const ALTURA_MAXIMA_DEL_PELLIZCO_MM = 16
export const ALTURA_INICIAL_DEL_PELLIZCO_MM = 8
/** Cuántas pinzas a la vez: la de quien opera y la del ayudante. */
export const MAXIMO_DE_PELLIZCOS = 2

export type TensionDeLaPiel = 'ninguna' | 'un-borde' | 'tensa'

/**
 * Si los bordes de la piel están tensos: hace falta una pinza **con dientes** en
 * cada labio. Con una sola, la piel cede hacia el otro lado y el bisturí corta a
 * medias, que es justo lo que se aprende a evitar.
 */
export function tensionDeLaPiel(pellizcos: readonly Pellizco[]): TensionDeLaPiel {
  const firmes = pellizcos.filter((p) => p.conDientes && p.alturaMm >= 3)
  const mas = firmes.some((p) => p.lado >= 0)
  const menos = firmes.some((p) => p.lado <= 0)
  if (firmes.length >= 2 && mas && menos) return 'tensa'
  return firmes.length > 0 ? 'un-borde' : 'ninguna'
}

/** Lo que se le dice a quien va a cortar los planos profundos según cómo dejó la piel. */
export function adviertePorLaTension(tension: TensionDeLaPiel): string | null {
  if (tension === 'tensa') return null
  return tension === 'un-borde'
    ? 'Solo hay un borde de la piel tomado con pinza. Tome los dos —una la sostiene quien opera y la otra el ayudante—: así la piel queda tensa y el corte es completo.'
    : 'Antes de profundizar se toman los bordes de la piel con pinzas con dientes —una quien opera y la otra el ayudante—: así se les da tensión para cortar la piel por completo.'
}
