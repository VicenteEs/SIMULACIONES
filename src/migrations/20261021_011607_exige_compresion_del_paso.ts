import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_pasos" ADD COLUMN "exige_compresion" boolean;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "exige_compresion" boolean;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_pasos" DROP COLUMN "exige_compresion";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "exige_compresion";`)
}
