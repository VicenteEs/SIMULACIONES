import type { CollectionBeforeDeleteHook } from 'payload'

/**
 * Al borrar un caso, se va con él su resolución de referencia (D-373).
 *
 * La base no lo hace sola: la relación de Payload es una columna con
 * `ON DELETE SET NULL`, así que la fila se quedaría con el caso a nulo, sin que
 * nada la vuelva a leer y con la solución entera de un caso que ya no existe.
 *
 * **Antes** del borrado y no después. Se escribió primero como `afterDelete`, y
 * la prueba de integración lo pilló: para entonces la base ya ha puesto la
 * columna a nulo, la búsqueda por el caso no encuentra nada y la fila se queda.
 *
 * Con la misma `req` del borrado: si el borrado se deshace, esto también. Un
 * fallo aquí no se traga, por lo mismo; preferible que el caso siga estando a
 * que se borre y deje la fila huérfana.
 */
export const borrarSuResolucionDeReferencia: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({
    collection: 'resoluciones-de-referencia',
    where: { cirugia: { equals: id } },
    overrideAccess: true,
    req,
  })
}
