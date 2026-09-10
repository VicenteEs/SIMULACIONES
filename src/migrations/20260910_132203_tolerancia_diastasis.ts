import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_pasos" ADD COLUMN "tolerancia_diastasis" numeric DEFAULT 5;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "tolerancia_diastasis" numeric DEFAULT 5;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_pasos" DROP COLUMN "tolerancia_diastasis";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "tolerancia_diastasis";`)
}
