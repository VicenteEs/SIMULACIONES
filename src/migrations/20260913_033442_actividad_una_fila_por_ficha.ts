import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Una sola fila de actividad por usuario y ficha, y que lo sostenga la base.
 *
 * El `CREATE UNIQUE INDEX` de abajo es lo único que `migrate:create` generó a
 * partir de `src/collections/Actividad.ts`. El `DELETE` de encima está escrito
 * a mano y no se puede quitar: `anotar` (acciones/actividad.ts) consulta y, si
 * no hay fila, crea, y entre esas dos operaciones caben dos peticiones en
 * paralelo —abrir una ficha y marcarla enseguida son dos, y entre dos pestañas
 * ni siquiera las ordena el navegador—. Toda base que lleve tiempo en marcha
 * puede traer el par, y con un solo duplicado `CREATE UNIQUE INDEX` falla, la
 * transacción de la migración se deshace y el despliegue se queda a medias sin
 * que el mensaje diga de qué ficha se trata.
 *
 * Cuál de las dos filas sobrevive, en este orden: la que está marcada como
 * leída —perder eso sería devolverle al residente una lectura que ya había
 * hecho—, y entre iguales la de `ultimaVisita` más reciente. El `id` deshace el
 * empate que quede, para que el resultado no dependa del orden en que
 * PostgreSQL devuelva las filas.
 *
 * Se registra cuántas se retiraron porque esto destruye datos en producción sin
 * preguntar, y el registro del despliegue es el único sitio donde queda
 * constancia. En la base de desarrollo de hoy son cero.
 *
 * El `down` solo suelta el índice: las filas duplicadas no vuelven. Deshacer
 * esta migración devuelve la tabla a admitir el par, no a tenerlo.
 */

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  // La comparación de filas de PostgreSQL va elemento a elemento: `false` es
  // menor que `true`, así que la marcada como leída gana. `COALESCE` en las dos
  // primeras porque `completado` puede ser nulo en filas anteriores a su valor
  // por omisión y `ultimaVisita` no tiene `NOT NULL`; `created_at` sí lo tiene.
  // Las filas con `usuario_id` nulo no se emparejan —`NULL = NULL` no es
  // cierto—, que es justo lo que hará también el índice único.
  const { rows: retiradas } = await db.execute(sql`
   DELETE FROM "actividad" AS "sobrante"
    USING "actividad" AS "superviviente"
    WHERE "sobrante"."usuario_id" = "superviviente"."usuario_id"
      AND "sobrante"."coleccion" = "superviviente"."coleccion"
      AND "sobrante"."documento_id" = "superviviente"."documento_id"
      AND (
        COALESCE("sobrante"."completado", false),
        COALESCE("sobrante"."ultima_visita", "sobrante"."created_at"),
        "sobrante"."id"
      ) < (
        COALESCE("superviviente"."completado", false),
        COALESCE("superviviente"."ultima_visita", "superviviente"."created_at"),
        "superviviente"."id"
      )
    RETURNING "sobrante"."id";`)

  payload.logger.info(
    `actividad: ${retiradas.length} fila(s) duplicada(s) retirada(s) antes de crear el índice único.`,
  )

  await db.execute(sql`
   CREATE UNIQUE INDEX "usuario_coleccion_documentoId_idx" ON "actividad" USING btree ("usuario_id","coleccion","documento_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "usuario_coleccion_documentoId_idx";`)
}
