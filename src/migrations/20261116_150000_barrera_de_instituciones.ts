import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * La segunda barrera entre instituciones (P-016 E5.4, D-396, D-399): la base
 * repite el filtro de `reglas.ts` para lo que el panel lee con
 * `overrideAccess: true`.
 *
 * Tres piezas:
 *
 * - **El rol `traumahub_app`**, sin privilegios de superusuario y con lo justo
 *   sobre las tablas. La aplicación lo toma al hacer una consulta desde el
 *   subdominio de una institución (`src/lib/barreraDeInstitucion.ts`). El
 *   usuario de la base de Docker es superusuario, y a un superusuario no se le
 *   aplica ninguna política: sin el cambio de rol no habría barrera.
 * - **Las políticas**, en las 20 tablas con la columna de institución. El lugar
 *   sale de `traumahub.subdominio`, que la aplicación pone en cada conexión:
 *   - el contenido, medios, modelos y cuentas: se lee lo central y lo propio
 *     (de lo central con borradores, solo lo publicado); se escribe solo lo
 *     propio;
 *   - lo que deja cada persona: solo lo propio, para leer y para escribir.
 * - **El último administrador**: el disparador cuenta ahora solo los de
 *   TraumaHub. Con instituciones, el administrador de una contaría como el
 *   último de la plataforma.
 *
 * Sin el rol (la central, los guiones, las migraciones, la conservación), la
 * conexión es la de siempre y ve todo: el dueño de las tablas no pasa por las
 * políticas, y un superusuario tampoco.
 *
 * Las tablas hijas de Payload (los bloques, las relaciones, las sesiones) no
 * llevan columna de institución ni política: Payload solo llega a ellas desde
 * la fila de su tabla madre, que sí la tiene.
 *
 * Cada orden en su propio `db.execute`, por el motivo que da la migración del
 * último administrador: el protocolo extendido de `pg` no admite varias.
 */

const ROL = 'traumahub_app'

/** Las que comparten lo central: el contenido, sus archivos y las cuentas. */
const COMPARTIDAS = ['usuarios', 'medios', 'modelos_3d', 'patologias', 'maniobras', 'casos_ao', 'cirugias', 'estudios_ia']

/** De las compartidas, las que tienen borradores: lo central se lee solo publicado. */
const CON_BORRADORES = ['patologias', 'maniobras', 'casos_ao', 'cirugias', 'estudios_ia']

/** Lo que deja cada persona: cada institución, solo lo suyo. */
const PROPIAS = [
  'actividad',
  'comentarios',
  'registro_de_acciones',
  'entradas',
  'tiempo_activo',
  'revisiones',
  'sesiones_de_revision',
]

/**
 * La institución del lugar de la conexión, o `NULL` si el subdominio no es de
 * ninguna. Entre paréntesis y como subconsulta, para que PostgreSQL la calcule
 * una vez por consulta y no una vez por fila.
 */
const LUGAR = `(SELECT i.id FROM instituciones i WHERE i.subdominio = current_setting('traumahub.subdominio', true))`

/** Las cuatro políticas de una tabla. */
function politicas(tabla: string, columna: string, lectura: string): string[] {
  const propio = `${columna} = ${LUGAR}`
  return [
    `CREATE POLICY traumahub_leer ON "${tabla}" FOR SELECT USING (${lectura})`,
    `CREATE POLICY traumahub_crear ON "${tabla}" FOR INSERT WITH CHECK (${propio})`,
    `CREATE POLICY traumahub_cambiar ON "${tabla}" FOR UPDATE USING (${propio}) WITH CHECK (${propio})`,
    `CREATE POLICY traumahub_borrar ON "${tabla}" FOR DELETE USING (${propio})`,
  ]
}

/** Todas las tablas con barrera, con su columna y lo que se lee de ellas. */
function tablasConBarrera(): { tabla: string; columna: string; lectura: string }[] {
  const lista: { tabla: string; columna: string; lectura: string }[] = []
  for (const tabla of COMPARTIDAS) {
    const publicado = CON_BORRADORES.includes(tabla) ? ` AND _status = 'published'` : ''
    lista.push({
      tabla,
      columna: 'institucion_id',
      lectura: `institucion_id = ${LUGAR} OR (institucion_id IS NULL${publicado})`,
    })
  }
  // Las versiones guardan los campos con el prefijo `version_`.
  for (const tabla of CON_BORRADORES) {
    lista.push({
      tabla: `_${tabla}_v`,
      columna: 'version_institucion_id',
      lectura: `version_institucion_id = ${LUGAR} OR (version_institucion_id IS NULL AND version__status = 'published')`,
    })
  }
  for (const tabla of PROPIAS) {
    lista.push({ tabla, columna: 'institucion_id', lectura: `institucion_id = ${LUGAR}` })
  }
  return lista
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  // El rol es de todo el servidor de bases, no de esta base: puede existir ya
  // si otra base del mismo servidor lo creó, o si se restauró un respaldo.
  await db.execute(
    sql.raw(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL}') THEN
        CREATE ROLE ${ROL} NOLOGIN;
      END IF;
    END $$`),
  )
  // Quien se conecta tiene que poder tomarlo. Al superusuario no le hace falta,
  // pero un usuario corriente sí la necesita, y no estorba.
  await db.execute(sql.raw(`GRANT ${ROL} TO CURRENT_USER`))
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${ROL}`))
  await db.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`))
  await db.execute(sql.raw(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${ROL}`))
  // Y lo que creen las migraciones de mañana, que corren con este mismo usuario.
  await db.execute(
    sql.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROL}`),
  )
  await db.execute(sql.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${ROL}`))

  for (const { tabla, columna, lectura } of tablasConBarrera()) {
    await db.execute(sql.raw(`ALTER TABLE "${tabla}" ENABLE ROW LEVEL SECURITY`))
    for (const orden of politicas(tabla, columna, lectura)) await db.execute(sql.raw(orden))
  }

  // El último administrador: solo cuentan los de TraumaHub, y quitar uno de
  // una institución no se mira aquí (se decide en E5.6).
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION impedir_quedarse_sin_administrador() RETURNS trigger AS $cuerpo$
    DECLARE
      quedan integer;
    BEGIN
      IF OLD."institucion_id" IS NOT NULL THEN
        RETURN NULL;
      END IF;
      PERFORM pg_advisory_xact_lock(8891001);
      SELECT count(*) INTO quedan
        FROM "usuarios"
       WHERE "rol" = 'admin' AND "activo" = true AND "institucion_id" IS NULL;
      IF quedan = 0 THEN
        RAISE EXCEPTION 'La plataforma quedaría sin ningún administrador activo: cree otro administrador antes de desactivar o eliminar el último.'
          USING ERRCODE = '23514';
      END IF;
      RETURN NULL;
    END;
    $cuerpo$ LANGUAGE plpgsql;`)

  payload.logger.info('instituciones: la base pone la segunda barrera desde el subdominio de cada una (D-399).')
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION impedir_quedarse_sin_administrador() RETURNS trigger AS $cuerpo$
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

  for (const { tabla } of tablasConBarrera()) {
    for (const nombre of ['traumahub_leer', 'traumahub_crear', 'traumahub_cambiar', 'traumahub_borrar']) {
      await db.execute(sql.raw(`DROP POLICY IF EXISTS ${nombre} ON "${tabla}"`))
    }
    await db.execute(sql.raw(`ALTER TABLE "${tabla}" DISABLE ROW LEVEL SECURITY`))
  }

  // El rol se queda: es de todo el servidor de bases, y otra base puede estar
  // usándolo. Se le quitan los permisos sobre esta.
  await db.execute(
    sql.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ${ROL}`),
  )
  await db.execute(sql.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM ${ROL}`))
  await db.execute(sql.raw(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROL}`))
  await db.execute(sql.raw(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${ROL}`))
  await db.execute(sql.raw(`REVOKE USAGE ON SCHEMA public FROM ${ROL}`))

  payload.logger.info('instituciones: retirada la segunda barrera; queda solo el filtro de reglas.ts.')
}
