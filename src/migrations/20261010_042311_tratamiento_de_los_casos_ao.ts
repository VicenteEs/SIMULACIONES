import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_casos_ao_tratamiento" AS ENUM('conservador', 'tornillos', 'placa', 'clavo', 'fijador-externo', 'kirschner', 'artroplastia', 'otro');
  CREATE TYPE "public"."enum__casos_ao_v_version_tratamiento" AS ENUM('conservador', 'tornillos', 'placa', 'clavo', 'fijador-externo', 'kirschner', 'artroplastia', 'otro');
  ALTER TABLE "casos_ao" ADD COLUMN "tratamiento" "enum_casos_ao_tratamiento";
  ALTER TABLE "_casos_ao_v" ADD COLUMN "version_tratamiento" "enum__casos_ao_v_version_tratamiento";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "casos_ao" DROP COLUMN "tratamiento";
  ALTER TABLE "_casos_ao_v" DROP COLUMN "version_tratamiento";
  DROP TYPE "public"."enum_casos_ao_tratamiento";
  DROP TYPE "public"."enum__casos_ao_v_version_tratamiento";`)
}
