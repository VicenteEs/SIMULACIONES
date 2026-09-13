import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Que la base rechace quedarse sin ningún administrador activo.
 *
 * Qué falta hoy. `impedirAutobloqueo` e `impedirBorradoDelUltimoAdmin`
 * (`src/collections/hooks/autobloqueo.ts`) cuentan cuántos administradores
 * activos quedan **aparte** del que se toca y, si son cero, cortan. Eso es una
 * consulta y después una escritura, dos operaciones distintas: dos
 * administradores que se desactivan a la vez ven cada uno al otro todavía
 * activo, los dos pasan la comprobación y la plataforma se queda sin nadie que
 * pueda crear cuentas, activar a nadie ni entrar al panel. La única salida es
 * entonces editar la tabla `usuarios` con psql en un servidor compartido.
 * La ventana son milisegundos y por eso no se ha visto, pero el invariante vive
 * solo en el código y ningún código de aplicación puede cerrarla: hace falta que
 * el que arbitra sea quien escribe.
 *
 * Por qué DEFERRABLE INITIALLY DEFERRED, que es la mitad del arreglo. La
 * comprobación se hace al confirmar la transacción y no al escribir la fila. Eso
 * da las dos cosas que hacen falta:
 *
 * - Un cambio que pasa por un estado intermedio inválido sigue siendo legal.
 *   Relevar a un administrador —desactivar al saliente y activar al entrante en
 *   la misma transacción— no depende del orden en que se escriban las dos filas.
 * - Al confirmar, y solo entonces, se mira el resultado de verdad.
 *
 * Por qué además el cerrojo de aviso, que es la otra mitad. Con la comprobación
 * diferida pero sin cerrojo, las dos transacciones pueden llegar a confirmar a
 * la vez y contar las dos antes de que ninguna se haya hecho visible: la carrera
 * vuelve, solo que más estrecha. `pg_advisory_xact_lock` las pone en fila, así
 * que la segunda cuenta cuando la primera ya está confirmada, ve cero y se
 * deshace. El cerrojo se suelta solo al terminar la transacción.
 *
 * Depende de `READ COMMITTED`, que es el nivel por omisión y el que usa Payload:
 * cada consulta toma una instantánea nueva, y por eso la segunda transacción ve
 * lo que confirmó la primera. Con `REPEATABLE READ` la cuenta se haría sobre la
 * instantánea del principio y no vería nada; el día que alguien suba el nivel de
 * aislamiento, esto hay que revisarlo (aunque entonces PostgreSQL abortaría una
 * de las dos por conflicto de serialización, que también sirve).
 *
 * Por qué el disparador solo mira cuando la fila **dejaba** de ser administrador
 * activo (`WHEN`). Dos motivos, y los dos importan:
 *
 * - Una base que hoy ya esté sin administradores activos no se puede quedar
 *   bloqueada. Si el `WHEN` no se cumple no se cuenta nada, así que lo que se
 *   impide es el paso de «hay al menos uno» a «no hay ninguno», no el estado en
 *   sí. Un disparador que mirara el estado a secas convertiría una instalación
 *   ya rota en una instalación que además no se puede reparar.
 * - Sin él, cada inicio de sesión de un administrador —`afterLogin` escribe
 *   `ultimoAcceso`— pagaría el recuento y, peor, el cerrojo.
 *
 * Son dos disparadores y una sola función porque el `WHEN` de la modificación
 * necesita `NEW` para saber si la fila deja de ser administrador activo, y en un
 * disparador de borrado `NEW` no existe.
 *
 * Lo que esto NO arregla, para que nadie lo dé por cerrado:
 *
 * - El mensaje llega al panel como un error de servidor sin traducir, porque no
 *   es un `APIError` de Payload. Se lanza con SQLSTATE 23514 (`check_violation`)
 *   justamente para que `acciones/admin.ts` pueda reconocerlo por el código y
 *   dar el texto en español; ese archivo no es de este lote y queda pendiente.
 *   Mientras tanto, quien se topa con esto casi siempre viene de los ganchos,
 *   que sí explican qué pasa: el disparador es la red de la carrera, no la
 *   puerta de todos los días.
 * - En desarrollo no existe. Allí manda el `push` de Drizzle
 *   (`payload.config.ts`), que no aplica migraciones y no sabe de disparadores,
 *   así que esto solo corre en el servidor. Es la razón de que el porqué esté
 *   escrito aquí entero: nadie lo va a ver funcionar antes de desplegarlo.
 * - `TRUNCATE usuarios` se lo salta, porque `TRUNCATE` no dispara triggers de
 *   fila. Es deliberado: vaciar la tabla a propósito —un respaldo que se
 *   restaura— no debe chocar contra esto.
 */

const FUNCION = 'impedir_quedarse_sin_administrador'
const AL_MODIFICAR = 'usuarios_ultimo_administrador_al_modificar'
const AL_BORRAR = 'usuarios_ultimo_administrador_al_borrar'

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  // Una llamada por sentencia: `db.execute` viaja por el protocolo extendido de
  // node-postgres, que rechaza varias órdenes en el mismo texto. Los `;` de
  // dentro del `$cuerpo$` no cuentan: para el analizador son un literal.
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION ${sql.identifier(FUNCION)}() RETURNS trigger AS $cuerpo$
    DECLARE
      quedan integer;
    BEGIN
      PERFORM pg_advisory_xact_lock(8891001);
      SELECT count(*) INTO quedan
        FROM "usuarios"
       WHERE "rol" = 'admin' AND "activo" = true;
      IF quedan = 0 THEN
        RAISE EXCEPTION 'La plataforma quedaría sin ningún administrador activo: cree otro administrador antes de desactivar o eliminar el último.'
          USING ERRCODE = '23514';
      END IF;
      RETURN NULL;
    END;
    $cuerpo$ LANGUAGE plpgsql;`)

  await db.execute(sql`
    CREATE CONSTRAINT TRIGGER ${sql.identifier(AL_MODIFICAR)}
      AFTER UPDATE ON "usuarios"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      WHEN (
        OLD."rol" = 'admin' AND OLD."activo" = true
        AND (NEW."rol" IS DISTINCT FROM 'admin' OR NEW."activo" IS DISTINCT FROM true)
      )
      EXECUTE FUNCTION ${sql.identifier(FUNCION)}();`)

  await db.execute(sql`
    CREATE CONSTRAINT TRIGGER ${sql.identifier(AL_BORRAR)}
      AFTER DELETE ON "usuarios"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      WHEN (OLD."rol" = 'admin' AND OLD."activo" = true)
      EXECUTE FUNCTION ${sql.identifier(FUNCION)}();`)

  payload.logger.info(
    'usuarios: la base rechaza desde ahora el cambio que deje la plataforma sin ningún administrador activo.',
  )
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  // Los disparadores primero: la función no se puede soltar mientras alguno la
  // use. `IF EXISTS` porque deshacer una migración sobre una base que nunca la
  // aplicó del todo no debería añadir un segundo fallo al primero.
  await db.execute(sql`DROP TRIGGER IF EXISTS ${sql.identifier(AL_MODIFICAR)} ON "usuarios";`)
  await db.execute(sql`DROP TRIGGER IF EXISTS ${sql.identifier(AL_BORRAR)} ON "usuarios";`)
  await db.execute(sql`DROP FUNCTION IF EXISTS ${sql.identifier(FUNCION)}();`)

  payload.logger.info(
    'usuarios: retirada la restricción del último administrador activo; el invariante vuelve a vivir solo en los ganchos.',
  )
}
