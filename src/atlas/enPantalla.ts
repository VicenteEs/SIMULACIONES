import type { CatalogoDelAtlas } from './formato'

/**
 * El catálogo reducido a lo que está encendido: lo que hay «en pantalla».
 *
 * Existe por un fallo del árbol del taller que se contaba solo. Cada grupo del
 * árbol («Músculos», «Esqueleto»…) tenía una casilla que actuaba sobre **todas
 * las piezas del atlas** de ese grupo, no sobre las que se estaban viendo. Quien
 * se quedaba con la mano, apagaba un músculo y pulsaba la casilla del grupo para
 * apagar el resto veía que se encendían los músculos de todo el cuerpo: «A
 * medias» pasaba a «todo encendido» porque, desde el catálogo entero, faltaban
 * piezas por encender. Si la lista son solo las piezas encendidas, el grupo no
 * tiene nada fuera de pantalla que encender, y la casilla solo puede apagar.
 *
 * Devuelve el mismo catálogo, por identidad, cuando ya está todo encendido: el
 * árbol memoriza lo que arma sobre él, y con el cuerpo completo —el caso de
 * recién abierto— no hay por qué rehacerlo.
 *
 * Lo que se pierde, a propósito: una pieza que se apaga sale de la lista. Se
 * recupera con Deshacer o cambiando la lista a «Todo el atlas»; el árbol lo
 * explica debajo del selector.
 */
export function catalogoEnPantalla(
  catalogo: CatalogoDelAtlas,
  visibles: ReadonlySet<string>,
): CatalogoDelAtlas {
  const piezas = catalogo.piezas.filter((pieza) => visibles.has(pieza.id))
  if (piezas.length === catalogo.piezas.length) return catalogo
  return { ...catalogo, piezas }
}
