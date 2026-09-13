/**
 * Cómo se ordenan las maniobras en la única pantalla que tienen.
 *
 * El examen físico es el único módulo sin página por documento: sus maniobras
 * se pintan todas juntas en `examen-fisico/page.tsx`, agrupadas por segmento.
 * Eso, que era solo una decisión de presentación, pasó a ser el sitio donde se
 * marca cada lectura, y con ello una maniobra que no entra en ningún grupo deja
 * de ser un hueco en el listado: es una ficha publicada que cuenta en el total
 * de la portada y a la que nadie puede llegar para marcarla.
 *
 * Por eso el agrupado vive aquí y no dentro del JSX. Es la parte que se puede
 * probar sin base de datos ni navegador, y lo que hay que sostener —que las
 * maniobras que entran son exactamente las que salen— no se ve leyendo la
 * página.
 */

/** Lo que hace falta saber de una maniobra para colocarla. */
export interface ManiobraAgrupable {
  id: number | string
  segmento?: unknown
}

/** Lo que hace falta saber de un segmento para titular su grupo. */
export interface SegmentoAgrupador {
  id: number | string
  nombre?: unknown
}

export interface GrupoDeManiobras<M> {
  /** Para el `key` de React; no se enseña. */
  clave: string
  titulo: string
  lista: M[]
}

/**
 * Título del grupo de las que no tienen segmento reconocible.
 *
 * «Otras maniobras» y no «Sin segmento»: el residente no sabe qué es un
 * segmento vacío y lo que necesita es poder leerlas y marcarlas. Al editor le
 * basta con encontrarlas aquí para saber que les falta, porque en los demás
 * grupos no aparecen.
 */
export const TITULO_SIN_SEGMENTO = 'Otras maniobras'

/**
 * El segmento de una maniobra, venga poblado (`depth: 1`) o como referencia.
 *
 * Devuelve `null` cuando no hay ninguno, que es distinto de «no coincide con
 * ninguno de los cargados»: las dos cosas acaban en el mismo grupo, pero solo
 * una de ellas es un dato que falta.
 */
export const idDelSegmento = (maniobra: ManiobraAgrupable): number | string | null => {
  const segmento = maniobra.segmento as { id?: number | string } | number | string | null
  const referencia = typeof segmento === 'object' && segmento !== null ? segmento.id : segmento
  return referencia === undefined || referencia === null || referencia === '' ? null : referencia
}

/**
 * Reparte las maniobras en grupos, sin perder ninguna por el camino.
 *
 * Recorrer los segmentos y filtrar dentro —que es como estaba escrito en el
 * JSX— deja fuera a la maniobra cuyo segmento se borró, a la que nunca lo tuvo
 * y a la que cae más allá de los segmentos que se hayan pedido. Esa maniobra no
 * se pintaba en ninguna parte, y como el listado es la única pantalla del
 * módulo, tampoco se podía abrir, ni comentar, ni marcar como leída. Seguía
 * contando en el total de la portada, así que le dejaba a la cifra «por leer»
 * un suelo de uno que no se explicaba por nada visible en pantalla.
 *
 * Un grupo vacío no se devuelve: un segmento sin maniobras publicadas sacaba un
 * encabezado con nada debajo.
 */
export function agruparManiobrasPorSegmento<M extends ManiobraAgrupable>(
  maniobras: M[],
  segmentos: SegmentoAgrupador[],
): GrupoDeManiobras<M>[] {
  const grupos: GrupoDeManiobras<M>[] = []
  const colocadas = new Set<number | string>()

  for (const segmento of segmentos) {
    const lista = maniobras.filter((m) => idDelSegmento(m) === segmento.id)
    if (lista.length === 0) continue
    for (const m of lista) colocadas.add(m.id)
    grupos.push({
      clave: `segmento-${segmento.id}`,
      // El nombre es obligatorio en la colección, así que esto no debería
      // pasar nunca; se comprueba porque el `String(undefined)` de la versión
      // corta pinta «undefined» como encabezado de sección.
      titulo: typeof segmento.nombre === 'string' && segmento.nombre.trim() !== ''
        ? segmento.nombre
        : `Segmento ${segmento.id}`,
      lista,
    })
  }

  // Por identificador de maniobra y no volviendo a mirar su segmento: así lo
  // que decide es «no quedó colocada», que es justo la condición que importa, y
  // no hay forma de que una maniobra se caiga entre las dos comprobaciones.
  const sueltas = maniobras.filter((m) => !colocadas.has(m.id))
  if (sueltas.length > 0) {
    grupos.push({ clave: 'sin-segmento', titulo: TITULO_SIN_SEGMENTO, lista: sueltas })
  }

  return grupos
}
