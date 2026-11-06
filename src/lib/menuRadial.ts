/**
 * El menú radial y los atajos de los instrumentos (P-009, mejora de uso 9).
 *
 * Cambiar de instrumento era ir a la mesa de la izquierda, abrir su familia y buscarlo, también para volver al que se
 * acababa de soltar: la broca y el medidor, el bisturí y el separador se alternan diez veces en un mismo paso. Ahora un
 * clic derecho sobre el lienzo abre, donde está el cursor, los cinco últimos instrumentos cogidos; las teclas 1 a 5
 * los cogen sin abrirlo y Q vuelve al anterior, como el «último arma» de cualquier programa con herramientas.
 *
 * Son los cinco últimos **cogidos**, no los del paso: el menú no puede decir cuál toca, que en evaluación es parte de
 * lo que se mide. Puro, para probarlo sin lienzo.
 *
 * Desde P-012 (E5) cada uno tiene **su sitio**, el de su tecla, como en la mesa de Mayo: ver `MesaDeMayo`.
 */

import { anotarReciente } from './barraDeInstrumental'

/** Cuántos caben en el aro: más, y los botones se tocan en un aro del tamaño de un cursor. */
export const EN_EL_MENU = 5

/** Los instrumentos del menú, el más reciente primero, sin repetidos y sin pasar de cinco. */
export function instrumentosDelMenu(recientes: readonly string[]): string[] {
  return [...new Set(recientes)].slice(0, EN_EL_MENU)
}

/**
 * La mesa de Mayo del caso (P-012 E5): el sitio de cada tecla y el orden en que se usaron.
 *
 * Antes la tecla 1 era siempre el último cogido, la 2 el anterior, y así: cada instrumento que entraba en la mano
 * renumeraba a los demás, y la broca que era el 2 pasaba a ser el 3 al coger el medidor. Se acababa mirando el menú
 * antes de cada tecla, que es justo lo que un atajo tiene que ahorrar. En pabellón la mesa de Mayo no se reordena: cada
 * instrumento vuelve a su sitio y la mano lo busca ahí sin mirar.
 */
export interface MesaDeMayo {
  /** El instrumento de cada tecla, de la 1 a la 5; `null`, un sitio que nadie ha ocupado todavía. */
  sitios: (string | null)[]
  /** Los cogidos, el más reciente primero: de aquí salen Q y el sitio que se deja cuando la mesa está llena. */
  recientes: string[]
}

export const MESA_VACIA: MesaDeMayo = { sitios: [], recientes: [] }

/**
 * Los sitios después de un cambio en los recientes: el que ya tiene sitio lo conserva, y el que entra ocupa el primero
 * libre o, con la mesa llena, el del que lleva más tiempo sin usarse. Es el único que sale de los cinco últimos, así
 * que siempre hay justo un sitio para el que entra.
 */
export function sitiosDeLaMesa(antes: readonly (string | null)[], recientes: readonly string[]): (string | null)[] {
  const vivos = instrumentosDelMenu(recientes)
  const sitios = Array.from({ length: EN_EL_MENU }, (_, i) => {
    const quien = antes[i] ?? null
    return quien !== null && vivos.includes(quien) ? quien : null
  })
  for (const id of [...vivos].reverse()) {
    if (sitios.includes(id)) continue
    const libre = sitios.indexOf(null)
    if (libre >= 0) sitios[libre] = id
  }
  return sitios
}

/** La mesa después de coger `id`. */
export function cogerEnLaMesa(mesa: MesaDeMayo, id: string): MesaDeMayo {
  const recientes = anotarReciente(mesa.recientes, id, EN_EL_MENU)
  return { recientes, sitios: sitiosDeLaMesa(mesa.sitios, recientes) }
}

/**
 * Dónde va el botón `indice` de `total` en el aro, en píxeles desde el centro: el primero arriba y los demás en el
 * sentido de las agujas del reloj, que es como se lee la numeración 1 a 5.
 */
export function posicionEnElAro(indice: number, total: number, radio: number): { x: number; y: number } {
  const angulo = -Math.PI / 2 + (2 * Math.PI * indice) / Math.max(1, total)
  return { x: Math.round(radio * Math.cos(angulo)), y: Math.round(radio * Math.sin(angulo)) }
}

/**
 * Qué instrumento coge una tecla, o `null` si la tecla no es un atajo o no hay nada que coger.
 *
 * 1 a 5: el del sitio de esa tecla en la mesa de Mayo. Q: el anterior al de la mano. Si no se tiene nada en la mano, el
 * último que se tuvo (se soltó con Esc para mirar y se quiere volver a él).
 */
export function instrumentoDeLaTecla(tecla: string, mesa: MesaDeMayo, enLaMano: string | null): string | null {
  if (/^[1-5]$/.test(tecla)) return mesa.sitios[Number(tecla) - 1] ?? null
  const menu = instrumentosDelMenu(mesa.recientes)
  if (tecla === 'q' || tecla === 'Q') {
    if (!enLaMano) return menu[0] ?? null
    return menu.find((id) => id !== enLaMano) ?? null
  }
  return null
}
