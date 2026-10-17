import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "estructuras_anatomicas" ADD COLUMN "abordaje_cortar" varchar;
  ALTER TABLE "estructuras_anatomicas" ADD COLUMN "abordaje_separar" varchar;
  ALTER TABLE "_estructuras_anatomicas_v" ADD COLUMN "version_abordaje_cortar" varchar;
  ALTER TABLE "_estructuras_anatomicas_v" ADD COLUMN "version_abordaje_separar" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "estructuras_anatomicas" DROP COLUMN "abordaje_cortar";
  ALTER TABLE "estructuras_anatomicas" DROP COLUMN "abordaje_separar";
  ALTER TABLE "_estructuras_anatomicas_v" DROP COLUMN "version_abordaje_cortar";
  ALTER TABLE "_estructuras_anatomicas_v" DROP COLUMN "version_abordaje_separar";`)
}
