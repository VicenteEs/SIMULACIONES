/**
 * La selección del taller anatómico, sin three.
 *
 * Está aparte de `seleccionPorCaja.ts` por lo que pesa aquel: importa three, y
 * el taller carga el visor —y three con él— de forma diferida. Importar desde el
 * taller una función de cuatro líneas que viviera allí metía three entero en el
 * primer paquete de la pantalla.
 */

/**
 * Qué hacer con las piezas que llegan de un gesto de selección.
 *
 * `reemplazar` deja solo esas; `sumar` las añade; `quitar` las saca;
 * `alternar` cambia el estado de cada una, que es el Mayús + clic de Blender.
 */
export type ModoDeSeleccion = 'reemplazar' | 'sumar' | 'quitar' | 'alternar'

/**
 * La selección que queda tras un gesto. Devuelve siempre un conjunto NUEVO: el
 * visor sabe que la selección cambió comparando por identidad, igual que hace
 * con las piezas encendidas.
 */
export function seleccionTras(
  actual: ReadonlySet<string>,
  ids: readonly string[],
  modo: ModoDeSeleccion,
): Set<string> {
  if (modo === 'reemplazar') return new Set(ids)
  const nueva = new Set(actual)
  for (const id of ids) {
    if (modo === 'sumar') nueva.add(id)
    else if (modo === 'quitar') nueva.delete(id)
    else if (nueva.has(id)) nueva.delete(id)
    else nueva.add(id)
  }
  return nueva
}
