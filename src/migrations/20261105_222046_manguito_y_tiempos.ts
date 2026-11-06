import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias" ADD COLUMN "usa_manguito" boolean DEFAULT false;
  ALTER TABLE "cirugias" ADD COLUMN "presion_del_manguito" numeric;
  ALTER TABLE "cirugias" ADD COLUMN "tope_del_manguito" numeric;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_usa_manguito" boolean DEFAULT false;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_presion_del_manguito" numeric;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_tope_del_manguito" numeric;
  ALTER TABLE "actividad" ADD COLUMN "tiempos" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias" DROP COLUMN "usa_manguito";
  ALTER TABLE "cirugias" DROP COLUMN "presion_del_manguito";
  ALTER TABLE "cirugias" DROP COLUMN "tope_del_manguito";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_usa_manguito";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_presion_del_manguito";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_tope_del_manguito";
  ALTER TABLE "actividad" DROP COLUMN "tiempos";`)
}
