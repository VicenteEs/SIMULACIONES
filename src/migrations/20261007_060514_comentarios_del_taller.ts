import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_comentarios_coleccion" ADD VALUE 'instancias-atlas';
  ALTER TABLE "comentarios" ADD COLUMN "ancla" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "comentarios" ALTER COLUMN "coleccion" SET DATA TYPE text;
  DROP TYPE "public"."enum_comentarios_coleccion";
  CREATE TYPE "public"."enum_comentarios_coleccion" AS ENUM('patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia');
  ALTER TABLE "comentarios" ALTER COLUMN "coleccion" SET DATA TYPE "public"."enum_comentarios_coleccion" USING "coleccion"::"public"."enum_comentarios_coleccion";
  ALTER TABLE "comentarios" DROP COLUMN "ancla";`)
}
