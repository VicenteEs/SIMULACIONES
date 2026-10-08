import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_instrumental_categoria" AS ENUM('corte', 'suturas', 'exposicion', 'periostio', 'reduccion', 'fijacion', 'modelado', 'enclavado');
  ALTER TABLE "instrumental" ADD COLUMN "slug" varchar;
  ALTER TABLE "instrumental" ADD COLUMN "categoria" "enum_instrumental_categoria" DEFAULT 'fijacion';
  ALTER TABLE "instrumental" ADD COLUMN "especificaciones" varchar;
  ALTER TABLE "instrumental" ADD COLUMN "ajustes" jsonb;
  CREATE INDEX "instrumental_slug_idx" ON "instrumental" USING btree ("slug");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "instrumental_slug_idx";
  ALTER TABLE "instrumental" DROP COLUMN "slug";
  ALTER TABLE "instrumental" DROP COLUMN "categoria";
  ALTER TABLE "instrumental" DROP COLUMN "especificaciones";
  ALTER TABLE "instrumental" DROP COLUMN "ajustes";
  DROP TYPE "public"."enum_instrumental_categoria";`)
}
