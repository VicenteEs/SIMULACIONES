import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "revisiones" ADD COLUMN "archivo_fuente" varchar;
  ALTER TABLE "revisiones" ADD COLUMN "notas_para_el_revisor" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "revisiones" DROP COLUMN "archivo_fuente";
  ALTER TABLE "revisiones" DROP COLUMN "notas_para_el_revisor";`)
}
