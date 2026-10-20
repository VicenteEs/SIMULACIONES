import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_modelos_3d_clase" AS ENUM('herramienta', 'cuerpo');
  ALTER TABLE "modelos_3d" ADD COLUMN "clase" "enum_modelos_3d_clase" DEFAULT 'cuerpo' NOT NULL;
  CREATE INDEX "modelos_3d_clase_idx" ON "modelos_3d" USING btree ("clase");

  -- El reparto de lo que ya existía (P-004 E1, S1): herramienta es lo que algún instrumento usa como modelo; todo lo
  -- demás es cuerpo, que es el valor por omisión. Si un mismo modelo lo usan un instrumento y una cirugía, gana la cirugía:
  -- un hueso que alguien puso como «instrumento» por error no pasa a ser una herramienta por eso.
  UPDATE "modelos_3d" SET "clase" = 'herramienta'
   WHERE "id" IN (SELECT "modelo_id" FROM "instrumental" WHERE "modelo_id" IS NOT NULL)
     AND "id" NOT IN (SELECT "modelo_id" FROM "cirugias" WHERE "modelo_id" IS NOT NULL)
     AND "id" NOT IN (SELECT "version_modelo_id" FROM "_cirugias_v" WHERE "version_modelo_id" IS NOT NULL);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "modelos_3d_clase_idx";
  ALTER TABLE "modelos_3d" DROP COLUMN "clase";
  DROP TYPE "public"."enum_modelos_3d_clase";`)
}
