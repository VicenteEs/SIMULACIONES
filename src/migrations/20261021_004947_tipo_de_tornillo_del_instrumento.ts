import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_instrumental_tipo_de_tornillo" AS ENUM('cortical', 'esponjosa', 'rosca-parcial', 'bloqueado', 'canulado');
  ALTER TABLE "instrumental" ADD COLUMN "tipo_de_tornillo" "enum_instrumental_tipo_de_tornillo";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "instrumental" DROP COLUMN "tipo_de_tornillo";
  DROP TYPE "public"."enum_instrumental_tipo_de_tornillo";`)
}
