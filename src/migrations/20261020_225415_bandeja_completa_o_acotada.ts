import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cirugias_bandeja" AS ENUM('completa', 'acotada');
  CREATE TYPE "public"."enum__cirugias_v_version_bandeja" AS ENUM('completa', 'acotada');
  ALTER TABLE "cirugias" ADD COLUMN "bandeja" "enum_cirugias_bandeja" DEFAULT 'completa';
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_bandeja" "enum__cirugias_v_version_bandeja" DEFAULT 'completa';

  -- El reparto de lo que ya existía (P-004 E3, S2): una cirugía que ya tiene su bandeja armada a mano la conserva
  -- ('acotada'); las demás pasan a ver toda la mesa. Se mira la tabla de las publicadas y la de las versiones, que es
  -- donde viven los borradores: una cirugía a medio armar tiene su bandeja solo en la segunda.
  UPDATE "cirugias" SET "bandeja" = 'acotada'
   WHERE "id" IN (SELECT "parent_id" FROM "cirugias_rels" WHERE "path" = 'instrumental' AND "instrumental_id" IS NOT NULL);
  UPDATE "_cirugias_v" SET "version_bandeja" = 'acotada'
   WHERE "id" IN (SELECT "parent_id" FROM "_cirugias_v_rels" WHERE "path" = 'version.instrumental' AND "instrumental_id" IS NOT NULL);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias" DROP COLUMN "bandeja";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_bandeja";
  DROP TYPE "public"."enum_cirugias_bandeja";
  DROP TYPE "public"."enum__cirugias_v_version_bandeja";`)
}
