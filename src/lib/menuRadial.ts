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
 */

/** Cuántos caben en el aro: más, y los botones se tocan en un aro del tamaño de un cursor. */
export const EN_EL_MENU = 5

/** Los instrumentos del menú, el más reciente primero, sin repetidos y sin pasar de cinco. */
export function instrumentosDelMenu(recientes: readonly string[]): string[] {
  return [...new Set(recientes)].slice(0, EN_EL_MENU)
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
 * Q: el anterior al de la mano. Si no se tiene nada en la mano, el último que se tuvo (se soltó con Esc para mirar y
 * se quiere volver a él).
 */
export function instrumentoDeLaTecla(tecla: string, recientes: readonly string[], enLaMano: string | null): string | null {
  const menu = instrumentosDelMenu(recientes)
  if (/^[1-5]$/.test(tecla)) return menu[Number(tecla) - 1] ?? null
  if (tecla === 'q' || tecla === 'Q') {
    if (!enLaMano) return menu[0] ?? null
    return menu.find((id) => id !== enLaMano) ?? null
  }
  return null
}
