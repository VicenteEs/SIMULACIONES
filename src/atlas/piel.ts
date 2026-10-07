/**
 * La piel en el taller (D-162, E5.1).
 *
 * La piel del atlas es una sola pieza —`Skin`, de los pies a la cabeza—, la más
 * grande, y con ella encendida tapa todo lo demás. Aquí está lo que el taller
 * necesita saber de ella sin tocar el visor: cuál es y qué hacer para que
 * estorbe lo menos posible. Sin `three`.
 */

import type { CatalogoDelAtlas } from './formato'

/** Con cuánta opacidad se enciende la primera vez: la anatomía de debajo se sigue viendo. */
export const OPACIDAD_DE_LA_PIEL = 0.3

/** El identificador de la piel en un catálogo, o `null` si el atlas no la trae (D-138 la quitó y D-155 la devolvió). */
export function idDeLaPiel(catalogo: Pick<CatalogoDelAtlas, 'piezas'> | null | undefined): string | null {
  return catalogo?.piezas.find((p) => p.nombre === 'Skin')?.id ?? null
}

/**
 * Lo que sale de un marco de selección: la piel se queda fuera si hay algo más.
 *
 * El marco elige por centros (D-126) y el centro de la piel está en el abdomen, así
 * que cualquier marco sobre el vientre se la llevaba y el gesto siguiente —mover,
 * apagar— actuaba sobre el cuerpo entero. Si la piel es lo único que hay dentro, se
 * deja: quien lo quiere así, la quiere.
 */
export function sinLaPielSiHayMas(ids: readonly string[], piel: string | null): string[] {
  if (!piel || !ids.includes(piel)) return [...ids]
  const resto = ids.filter((id) => id !== piel)
  return resto.length > 0 ? resto : [...ids]
}
