import type { Payload, Where } from 'payload'

/**
 * Lo que un residente ya leyó, preguntado en un solo sitio.
 *
 * Las cinco páginas de módulo necesitan saberlo antes de pintar nada, porque
 * la casilla de «leída» la pinta `RastreadorActividad`, que es de cliente y
 * nace con `completadoInicial`: sin esta pregunta sale en blanco en cada carga
 * y el residente vuelve a marcar lo que ya tenía marcado.
 *
 * ## Por qué aquí y no en cada página
 *
 * La consulta estuvo copiada cinco veces —las cuatro fichas por documento y el
 * listado del examen físico—, y cada copia llevaba en su comentario la promesa
 * de mudarse a `src/lib` «para que no acaben siendo cinco criterios». Ya
 * habían empezado a serlo: cuatro tomaban `docs[0]` con `limit: 1` y decidían
 * la casilla con el `completado` de esa fila; la del examen físico miraba todas
 * y bastaba con que una dijera que sí. Con dos filas de la misma ficha —las que
 * dejaron las pestañas paralelas de antes del índice único, ver
 * `FILAS_A_CORREGIR` en `acciones/actividad.ts`— una maniobra salía marcada y
 * una patología en el mismo estado podía salir en blanco.
 *
 * ## Por qué una lista y no un documento
 *
 * El examen físico pinta todas sus maniobras en la misma página: preguntar por
 * una ficha cada vez serían treinta viajes a PostgreSQL para pintar treinta
 * casillas, y nada en pantalla lo delataría. Así que la función pregunta
 * siempre por una lista con `in:` y en UNA consulta, y la ficha por documento
 * es el caso de la lista de un elemento. Lo contrario —una función por
 * documento y un bucle en el listado— es justo la regresión que hay que evitar.
 *
 * ## Sin tope, y es a propósito
 *
 * Va con `pagination: false` y sin `limit`. Cuando la consulta vivía en el
 * listado llevaba el mismo tope que las maniobras, y la cabecera de aquel
 * archivo explicaba el riesgo: un tope más bajo aquí dejaba maniobras leídas
 * con la casilla en blanco sin que fallara nada. Lo que acota la respuesta es
 * el propio `in:` —como mucho una fila por identificador pedido, que es lo que
 * promete el índice único de `actividad`—, así que el tope solo podía quitar
 * filas, nunca proteger de nada.
 */

/** Lo que las páginas necesitan saber de las fichas que acaban de traer. */
export interface Lecturas {
  /**
   * Si el residente dio esta ficha por leída.
   *
   * Basta con que lo diga una de sus filas. Si hubiera dos, la que dice que sí
   * es la que escribió él al marcar; la otra es una gemela de antes del índice
   * que `anotar` corrige en la siguiente escritura. Enseñar la casilla en
   * blanco por la gemela sería volver a pedirle un gesto que ya hizo.
   */
  leida(documentoId: string | number): boolean
  /**
   * La fila entera de esta ficha, o `null` si no la hay.
   *
   * El simulador saca de aquí el recorrido guardado (`recorridoGuardado` en
   * `src/lib/progresoDelSimulador.ts`): puntaje y complicaciones viven en la
   * misma fila que la marca de lectura, y pedirlos aparte sería una segunda
   * consulta a la misma fila. Con filas gemelas se queda la de la visita más
   * reciente, que es la que tiene el último recorrido.
   */
  registro(documentoId: string | number): Record<string, unknown> | null
}

const SIN_LECTURAS: Lecturas = {
  leida: () => false,
  registro: () => null,
}

/**
 * Qué fichas de `coleccion`, de entre `documentos`, tiene leídas este usuario.
 *
 * Nunca lanza. La actividad es una comodidad y la ficha es el contenido: una
 * avería en esa tabla no puede llevarse por delante la patología, el caso o el
 * listado entero. Lo que se pierde es el estado de las casillas, no el texto.
 * Las cinco copias ya lo hacían con un `.catch(() => null)` mudo; aquí además
 * se deja escrito en el registro del servidor, porque «todas las casillas en
 * blanco» es un síntoma que nadie relaciona con una consulta caída.
 *
 * Va con el **usuario efectivo** que la página ya tiene, el mismo que usa para
 * leer la ficha. Un administrador en vista previa como residente ve sus
 * propias marcas, igual que antes.
 *
 * Y va sin `overrideAccess: false`, como iban las cinco, y eso no abre nada:
 * quien acota a una sola cuenta es el `usuario: { equals }` del `where`, que es
 * literalmente el filtro que añadiría `accesoDePropiedad` para un lector. La
 * portada consulta `actividad` con `overrideAccess: true` a propósito, así que
 * estrenar aquí el control de acceso sería probar un camino nuevo detrás de un
 * `catch` que se traga el fallo: si algo no casara, las casillas saldrían en
 * blanco y nadie vería por qué. Si esto cambia, cambia en esta función y llega
 * a las cinco páginas a la vez, que es lo que se ganó con la mudanza.
 */
export async function lecturasDelResidente(
  payload: Pick<Payload, 'find'>,
  usuarioEfectivo: unknown,
  coleccion: string,
  documentos: readonly (string | number)[],
): Promise<Lecturas> {
  const usuarioId = (usuarioEfectivo as { id?: string | number } | null | undefined)?.id
  // Sin cuenta no hay de quién preguntar, y sin fichas no hay qué: un `in: []`
  // es una consulta entera para obtener una lista vacía que ya se sabe.
  if (usuarioId === undefined || usuarioId === null || usuarioId === '') return SIN_LECTURAS

  // En texto porque `documentoId` es una columna de texto (`Actividad.ts`) y el
  // listado trae los identificadores como números: `7` y `'7'` tienen que ser
  // la misma ficha al buscar y al responder. Y sin repetidos, que no cambian
  // la respuesta y sí alargan el `in:`.
  const identificadores = [...new Set(documentos.map((d) => String(d)))]
  if (identificadores.length === 0) return SIN_LECTURAS

  const donde: Where = {
    and: [
      { usuario: { equals: usuarioId } },
      { coleccion: { equals: coleccion } },
      { documentoId: { in: identificadores } },
    ],
  }

  let filas: Record<string, unknown>[]
  try {
    const respuesta = await payload.find({
      collection: 'actividad',
      where: donde,
      user: usuarioEfectivo as never,
      pagination: false,
      // La más reciente primero: si hay gemelas, `registro` se queda con la
      // primera que ve de cada ficha.
      sort: '-ultimaVisita',
      depth: 0,
    })
    filas = respuesta.docs as unknown as Record<string, unknown>[]
  } catch (error) {
    console.error(`[lecturas] no se pudo leer lo leído en «${coleccion}»:`, error)
    return SIN_LECTURAS
  }

  const registros = new Map<string, Record<string, unknown>>()
  const leidas = new Set<string>()
  for (const fila of filas) {
    const clave = String(fila.documentoId)
    if (!registros.has(clave)) registros.set(clave, fila)
    if (fila.completado === true) leidas.add(clave)
  }

  return {
    leida: (documentoId) => leidas.has(String(documentoId)),
    registro: (documentoId) => registros.get(String(documentoId)) ?? null,
  }
}
