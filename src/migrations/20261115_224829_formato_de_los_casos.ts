import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * La versión de formato de los casos del simulador (D-373, E3 de P-016).
 *
 * Añade la columna a los casos y a sus versiones, y escribe el 1 en todos los
 * que ya existen: la versión 1 es el formato del 2026-11-15 tal como lo lee
 * `casoParaLaConsola`, y todos los casos guardados están en él
 * (`formatoDelCaso.ts`). Sin el 1, la conversión 0 → 1 los trataría igual,
 * pero el ensayo de los casos no podría distinguir un caso de antes de D-373 de
 * uno que se dejó atrás una migración de formato.
 *
 * También en `_cirugias_v`: restaurar una versión antigua devuelve el caso con
 * la versión que tenía al guardarse, y a partir de aquí toda versión la lleva.
 *
 * El `down` quita las dos columnas. Volver atrás solo pierde el número: el
 * formato 1 se leía igual sin él.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias" ADD COLUMN "version_del_formato" numeric;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_version_del_formato" numeric;
  UPDATE "cirugias" SET "version_del_formato" = 1;
  UPDATE "_cirugias_v" SET "version_version_del_formato" = 1;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias" DROP COLUMN "version_del_formato";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_version_del_formato";`)
}
