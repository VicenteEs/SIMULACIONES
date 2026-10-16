import type { Payload, Where } from 'payload'

/**
 * Todas las filas de una colección, no las más recientes (D-175).
 *
 * El seguimiento del panel leía con `limit: 1000` o `limit: 2000` y contaba lo que llegaba: pasada esa cifra, los totales
 * de «Por persona», «Fichas más leídas» o «Lecturas» eran un recuento de las filas más recientes presentado como el
 * total, sin una palabra que lo dijera. Con 2.700 fichas ya escritas y cada residente sumando filas, el día en que se
 * cruza el tope los números siguen pareciendo exactos y dejan de serlo.
 *
 * Se cuenta primero y se pide después con ese número: una sola consulta trae todo y no hay un «hay más» que se
 * olvide mirar. `select` va casi siempre, porque lo que pesa de una ficha son sus textos y aquí interesan dos columnas.
 * Con un techo, para que una tabla desbocada no se coma la memoria del servidor: si se alcanza, `completa` es `false` y
 * quien pinte tiene que decirlo en vez de presentar la parte como el todo.
 */
export const TECHO_DE_LECTURA = 200_000

export interface LecturaDeFilas {
  docs: Record<string, unknown>[]
  /** Cuántas filas hay en total, según la base. */
  total: number
  /** `docs` son todas las filas: si es `false`, se alcanzó el techo y lo leído es una parte. */
  completa: boolean
}

export async function leerTodas(
  payload: Payload,
  opciones: {
    coleccion: string
    where?: Where
    select?: Record<string, boolean>
    sort?: string
    techo?: number
  },
): Promise<LecturaDeFilas> {
  const techo = opciones.techo ?? TECHO_DE_LECTURA
  const { totalDocs } = await payload.count({
    collection: opciones.coleccion as never,
    ...(opciones.where ? { where: opciones.where } : {}),
    overrideAccess: true,
  })
  if (totalDocs === 0) return { docs: [], total: 0, completa: true }

  const r = await payload.find({
    collection: opciones.coleccion as never,
    ...(opciones.where ? { where: opciones.where } : {}),
    ...(opciones.select ? { select: opciones.select as never } : {}),
    ...(opciones.sort ? { sort: opciones.sort } : {}),
    depth: 0,
    limit: Math.min(totalDocs, techo),
    pagination: false,
    overrideAccess: true,
  })
  const docs = r.docs as unknown as Record<string, unknown>[]
  return { docs, total: totalDocs, completa: docs.length >= totalDocs }
}
