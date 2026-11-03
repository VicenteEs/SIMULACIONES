/**
 * La lista del examen físico en dos columnas (P-007 E4, D-237): qué maniobras
 * enseña la lista, cuál va antes y después de cada una y dónde se busca.
 *
 * Es puro y sin React para que se pruebe sin navegador: la lista y el detalle
 * los arma `ManiobrasPorSegmento`, pero lo que hay que sostener —que buscar
 * encuentra lo que se ve, que «siguiente» no salta a otro segmento, que un
 * ancla escrita a mano no elige una maniobra que no existe— se decide aquí.
 *
 * También vive aquí la receta de la búsqueda, que antes estaba copiada en la
 * página (de servidor) y en el buscador (de cliente) con un comentario que
 * pedía cambiar las dos a la vez: un archivo sin `'use client'` ni Payload se
 * importa desde los dos lados, y la copia sobra.
 */

export interface ManiobraDeLaLista {
  id: string
  nombre: string
  /** Lo que evalúa, en una línea bajo el nombre. */
  evalua: string
  /** Nombre y lo que evalúa, normalizados con `normalizarBusqueda`. */
  busqueda: string
  leida: boolean
}

export interface SegmentoDeLaLista {
  /** La `clave` de `agruparManiobrasPorSegmento`: `segmento-<id>` o `sin-segmento`. */
  clave: string
  titulo: string
  maniobras: ManiobraDeLaLista[]
}

/** Minúsculas y sin tildes: «rotacion» encuentra «Rotación», «hombro» encuentra «Hombro». */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Lo que se busca en cada maniobra: su nombre y lo que evalúa. La técnica no,
 * a propósito: es texto con formato y largo, y buscar «rodilla» devolvería
 * media columna por una mención de paso.
 */
export function textoBuscable(maniobra: { nombre?: unknown; evalua?: unknown }): string {
  return normalizarBusqueda(
    [maniobra.nombre, maniobra.evalua].filter((v): v is string => typeof v === 'string').join(' '),
  )
}

export interface Resultado {
  maniobra: ManiobraDeLaLista
  segmento: SegmentoDeLaLista
}

/**
 * Las maniobras que casan con lo escrito, de todos los segmentos y en el orden
 * en que salen en la página. Con el buscador vacío no devuelve nada: entonces
 * manda el segmento elegido, no la búsqueda.
 *
 * Cada palabra tiene que aparecer, en cualquier orden: «lca rodilla» encuentra
 * «Lachman · Integridad del LCA de rodilla», que con la frase entera no casaba.
 */
export function buscarManiobras(segmentos: SegmentoDeLaLista[], texto: string): Resultado[] {
  const palabras = normalizarBusqueda(texto).split(' ').filter(Boolean)
  if (palabras.length === 0) return []
  return segmentos.flatMap((segmento) =>
    segmento.maniobras
      .filter((m) => palabras.every((p) => m.busqueda.includes(p)))
      .map((maniobra) => ({ maniobra, segmento })),
  )
}

/** El segmento de una maniobra, o `null` si no está en la lista. */
export function segmentoDe(segmentos: SegmentoDeLaLista[], id: string): SegmentoDeLaLista | null {
  return segmentos.find((s) => s.maniobras.some((m) => m.id === id)) ?? null
}

/**
 * La anterior y la siguiente dentro del mismo segmento, sin dar la vuelta.
 *
 * Dentro del segmento porque es lo que dice la lista de al lado: «siguiente»
 * tiene que ser la fila de abajo, y saltar del último Lachman de rodilla al
 * primer test de tobillo cambiaría la lista entera sin haberla tocado. Sin
 * vuelta porque la primera que sigue a la última se lee como un error.
 */
export function vecinasDe(
  segmentos: SegmentoDeLaLista[],
  id: string,
): { anterior: ManiobraDeLaLista | null; siguiente: ManiobraDeLaLista | null } {
  const segmento = segmentoDe(segmentos, id)
  if (!segmento) return { anterior: null, siguiente: null }
  const i = segmento.maniobras.findIndex((m) => m.id === id)
  return {
    anterior: segmento.maniobras[i - 1] ?? null,
    siguiente: segmento.maniobras[i + 1] ?? null,
  }
}

/**
 * La maniobra que nombra un ancla `#maniobra-<id>`, si está en la lista.
 *
 * El ancla la escribe quien quiera en la barra de direcciones: una que no
 * corresponde a ninguna maniobra pintada se ignora y se queda la que había, en
 * vez de dejar el detalle en blanco.
 */
export function maniobraDelAncla(segmentos: SegmentoDeLaLista[], ancla: string, prefijo: string): string | null {
  if (!ancla.startsWith(prefijo)) return null
  const id = ancla.slice(prefijo.length)
  return segmentoDe(segmentos, id) ? id : null
}

/**
 * El primer video del material adicional va arriba del detalle, como en el
 * tablero de Penpot; el resto de los bloques sigue donde estaba, al pie.
 *
 * Solo el primero: una maniobra con dos videos los lleva por algo, y subir los
 * dos dejaría el texto de la técnica a una pantalla de distancia.
 */
export function separarVideo<B extends { blockType?: unknown }>(bloques: unknown): { video: B | null; resto: B[] } {
  if (!Array.isArray(bloques)) return { video: null, resto: [] }
  const lista = bloques as B[]
  const i = lista.findIndex((b) => b?.blockType === 'video')
  if (i === -1) return { video: null, resto: lista }
  return { video: lista[i], resto: [...lista.slice(0, i), ...lista.slice(i + 1)] }
}
