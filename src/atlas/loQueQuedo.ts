import type { CatalogoDelAtlas } from './formato'

/**
 * Lo que queda: el conjunto de piezas con el que se está trabajando.
 *
 * Existe por un fallo del árbol del taller que se contaba solo. Cada grupo del
 * árbol («Músculos», «Esqueleto»…) tenía una casilla que actuaba sobre **todas
 * las piezas del atlas** de ese grupo. Quien se quedaba con la mano, apagaba un
 * músculo y pulsaba la casilla del grupo veía que se encendían los músculos de
 * todo el cuerpo: el grupo estaba «a medias» respecto del catálogo entero y
 * pulsarlo lo completaba.
 *
 * La primera solución —listar solo lo encendido— arreglaba eso, pero sacaba de
 * la lista cada pieza que se apagaba, y entonces el músculo de la mano que se
 * apagaba por error no se podía volver a encender desde el árbol. Lo que pidió
 * quien trabaja aquí es lo otro: que la lista **se quede con lo que quedó tras
 * recortar**, apagado o encendido. Ese es este conjunto:
 *
 *   - empieza siendo el atlas entero (`null`: no hay nada que acotar);
 *   - se estrecha cuando se decide quedarse con algo —«solo», Mayús + H, un
 *     recorte seguido de «Solo esto»—, que es justo lo que no se quiere
 *     deshacer desde una casilla;
 *   - apagar piezas, por casilla o por grupo, no lo toca: lo apagado sigue en
 *     la lista, desmarcado, y una casilla de grupo solo mueve lo que hay dentro;
 *   - se ensancha con lo que se encienda desde fuera («Todo el atlas») y vuelve
 *     a ser el atlas entero con «Encender todo» y con «Cuerpo».
 */

/**
 * El catálogo reducido a las piezas que se conservan.
 *
 * Devuelve el mismo catálogo, por identidad, cuando no se acota nada o ya están
 * todas: el árbol memoriza lo que arma sobre él, y con el cuerpo completo —el
 * caso de recién abierto— no hay por qué rehacerlo.
 */
export function catalogoDeLoQueQuedo(
  catalogo: CatalogoDelAtlas,
  conservar: ReadonlySet<string> | null,
): CatalogoDelAtlas {
  if (conservar === null) return catalogo
  const piezas = catalogo.piezas.filter((pieza) => conservar.has(pieza.id))
  if (piezas.length === catalogo.piezas.length) return catalogo
  return { ...catalogo, piezas }
}

/**
 * El conjunto con lo que se haya encendido de más.
 *
 * Una pieza encendida desde «Todo el atlas» pasa a formar parte de lo que se
 * trabaja: si no, al apagarla desaparecería de la lista, que es el fallo que
 * este módulo viene a evitar. Devuelve el mismo conjunto si no hay nada nuevo,
 * para que React no vea un cambio donde no lo hay.
 */
export function ampliarConjunto(
  conjunto: ReadonlySet<string> | null,
  encendidas: Iterable<string>,
): ReadonlySet<string> | null {
  if (conjunto === null) return null
  let ampliado: Set<string> | null = null
  for (const id of encendidas) {
    if (conjunto.has(id)) continue
    ampliado ??= new Set(conjunto)
    ampliado.add(id)
  }
  return ampliado ?? conjunto
}

/**
 * Lo que enseña la lista: el conjunto y, por si acaso, todo lo encendido.
 *
 * Lo encendido tiene que estar siempre en la lista, también cuando un cambio
 * de piezas llega por un camino que no pasó por el conjunto (abrir una
 * preparación, deshacer). Es una red de seguridad: lo normal es que ya esté.
 */
export function conjuntoConLoEncendido(
  conjunto: ReadonlySet<string> | null,
  visibles: ReadonlySet<string>,
): ReadonlySet<string> | null {
  return ampliarConjunto(conjunto, visibles)
}
