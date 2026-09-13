/**
 * El árbol anatómico, leído en español.
 *
 * `armarArbol` y `buscarPiezas` (`src/atlas/catalogo.ts`) se escribieron cuando
 * las estructuras se enseñaban con su nombre original: ordenan por «Right
 * tibia» y buscan traduciendo la consulta al inglés palabra a palabra. Ahora el
 * árbol enseña «Tibia derecha», y ordenar por lo que no se ve deja la lista
 * desordenada a la vista: «Tibia derecha» caería entre las «R» de «Right…».
 *
 * Esto se pone encima de aquellas dos y no las sustituye, por dos razones:
 *
 *  - La tabla de traducciones trae 1.663 de los 1.674 nombres distintos del
 *    atlas —traducidos por agentes automáticos, con una segunda pasada que hizo
 *    de revisor clínico y dos comprobaciones de coherencia, pero NO leídos fila
 *    a fila por un médico: ver D-092—, y no todos: una estructura sin
 *    traducción se enseña en inglés (ver `src/atlas/nombres.ts`), y un atlas
 *    regenerado puede traer más. Para esas, lo único que hace que «arteria
 *    renal» encuentre «Ureteric segment of right renal artery» son las
 *    equivalencias de `buscarPiezas`; quitarlas sería que buscar en español
 *    dejara de funcionar justo donde todavía no hay español.
 *  - `catalogo.ts` lo usan también el servidor y sus pruebas, que cuentan con
 *    el orden y la puntuación de siempre.
 *
 * El día que todas las estructuras tengan traducción, esto puede mudarse dentro
 * de `catalogo.ts`; mientras tanto, quien quiera cambiar cómo se ordena o se
 * busca en el árbol tiene que hacerlo aquí, que es lo que el árbol llama.
 */

import { buscarPiezas, normalizar, terminosDeBusqueda, type ArbolDelAtlas } from './catalogo'
import type { CatalogoDelAtlas, PiezaDelAtlas } from './formato'
import { casaConLaBusqueda, nombreEnEspanol } from './nombres'

// ------------------------------------------------------------------ orden

/**
 * Las piezas de una lista, ordenadas por el nombre que se enseña.
 *
 * Con `localeCompare` en español y no con `<`: la comparación por código pone
 * «Órbita» detrás de «Zigomático» y «Ñ» detrás de todo. El nombre se calcula una
 * vez por pieza y no una vez por comparación, porque una rama del esqueleto
 * pasa de doscientas piezas y el orden se rehace al cambiar de eje.
 */
export function ordenarPorNombreEnEspanol(piezas: readonly PiezaDelAtlas[]): PiezaDelAtlas[] {
  return piezas
    .map((pieza) => ({ pieza, nombre: nombreEnEspanol(pieza.nombre) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(({ pieza }) => pieza)
}

/**
 * El mismo árbol, con cada rama ordenada por el nombre en español.
 *
 * No toca el que recibe. Devuelve los MISMOS objetos de pieza, no copias: la
 * fila del árbol va memorizada y compara la pieza por referencia, y una copia
 * por pieza la repintaría entera en cada paso del ratón (ver `FilaDePieza`).
 */
export function ordenarArbolEnEspanol(arbol: readonly ArbolDelAtlas[]): ArbolDelAtlas[] {
  return arbol.map((grupo) => ({
    ...grupo,
    ramas: grupo.ramas.map((rama) => ({ ...rama, piezas: ordenarPorNombreEnEspanol(rama.piezas) })),
  }))
}

// --------------------------------------------------------------- búsqueda

/**
 * Cuántas coincidencias se pintan. Las mismas 60 que pintaba el árbol antes:
 * una consulta de dos letras —«ri», «de»— casa con cientos de piezas, y pintar
 * mil filas en cada pulsación es lo que deja el campo de búsqueda pastoso.
 */
export const LIMITE_DE_COINCIDENCIAS = 60

export interface BusquedaEnEspanol {
  /** Las primeras, de más a menos parecidas. */
  piezas: PiezaDelAtlas[]
  /**
   * Cuántas casan en total. Se devuelve aparte para poder decir «60 de 214»:
   * antes el árbol decía «60 coincidencias» cuando había más, y quien no veía la
   * suya creía que no existía.
   */
  total: number
}

/**
 * Busca piezas por el nombre en español y por el original.
 *
 * Una pieza entra si casa por cualquiera de los dos caminos:
 *
 *  - `casaConLaBusqueda`, que exige todas las palabras, en cualquier orden,
 *    dentro del nombre en español o dentro del original, sin tildes: «perone»
 *    encuentra «Peroné derecho», «fibula» también, y «peroneo derecho»
 *    encuentra «Peroneo corto derecho»;
 *  - `buscarPiezas`, que también exige todas las palabras pero solo sobre el
 *    original, traduciendo antes las más comunes: es lo que encuentra las
 *    estructuras sin traducción cuando se busca en español.
 *
 * Hasta que `casaConLaBusqueda` aceptó las palabras salteadas, la única vía
 * sin orden era la segunda, y en español solo funcionaba con las palabras que
 * sabe traducir: «derecha tibia» encontraba la tibia porque «tibia» y «derecha»
 * están en sus equivalencias, y «peroneo derecho» no encontraba nada.
 *
 * El orden premia lo que se ve: el nombre que es exactamente lo buscado, el que
 * empieza por ello y el que lo contiene de corrido, y a igualdad el más corto,
 * que suele ser la estructura principal —la tibia antes que la arteria que la
 * nombra—. El último desempate es alfabético en español, para que dos
 * búsquedas iguales den siempre la misma lista.
 */
export function buscarEnEspanol(
  catalogo: CatalogoDelAtlas,
  consulta: string,
  limite = LIMITE_DE_COINCIDENCIAS,
): BusquedaEnEspanol {
  const aguja = normalizar(consulta)
  if (!aguja) return { piezas: [], total: 0 }

  // Sin tope: el tope de `buscarPiezas` es el suyo, y aquí se reordena todo.
  const porPalabras = new Set(
    buscarPiezas(catalogo, consulta, Number.POSITIVE_INFINITY).map((r) => r.pieza.id),
  )
  const buscadas = new Set([...aguja.split(' '), ...terminosDeBusqueda(consulta)])

  const encontradas: { pieza: PiezaDelAtlas; nombre: string; puntos: number }[] = []
  for (const pieza of catalogo.piezas) {
    if (!casaConLaBusqueda(pieza.nombre, consulta) && !porPalabras.has(pieza.id)) continue

    const nombre = nombreEnEspanol(pieza.nombre)
    const visible = normalizar(nombre)
    const original = normalizar(pieza.nombre)

    let puntos = 0
    if (visible === aguja || original === aguja) puntos += 100
    if (visible.startsWith(aguja) || original.startsWith(aguja)) puntos += 25
    // De corrido se mira aquí y no con `casaConLaBusqueda`, que ya no lo exige:
    // entrar con las palabras salteadas vale, pero el nombre que lo trae
    // seguido es el que se estaba escribiendo y va delante.
    if (visible.includes(aguja) || original.includes(aguja)) puntos += 10
    const palabras = new Set([...visible.split(' '), ...original.split(' ')])
    for (const buscada of buscadas) if (palabras.has(buscada)) puntos += 10
    puntos -= Math.min(20, visible.length / 4)

    encontradas.push({ pieza, nombre, puntos })
  }

  encontradas.sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, 'es'))
  return {
    piezas: encontradas.slice(0, limite).map(({ pieza }) => pieza),
    total: encontradas.length,
  }
}
