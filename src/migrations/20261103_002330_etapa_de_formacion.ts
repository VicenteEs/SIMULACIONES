import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_usuarios_etapa_de_formacion" AS ENUM('r1', 'r2', 'r3', 'r4', 'kinesiologia', 'docente');
  ALTER TABLE "usuarios" ADD COLUMN "etapa_de_formacion" "enum_usuarios_etapa_de_formacion";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "usuarios" DROP COLUMN "etapa_de_formacion";
  DROP TYPE "public"."enum_usuarios_etapa_de_formacion";`)
}
