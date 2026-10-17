import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cirugias_pasos_accion_del_plano" AS ENUM('cortar', 'separar');
  CREATE TYPE "public"."enum__cirugias_v_version_pasos_accion_del_plano" AS ENUM('cortar', 'separar');
  ALTER TYPE "public"."enum_cirugias_pasos_objetivo" ADD VALUE 'planos';
  ALTER TYPE "public"."enum__cirugias_v_version_pasos_objetivo" ADD VALUE 'planos';
  ALTER TABLE "cirugias_pasos" ADD COLUMN "musculo_del_plano" varchar;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "accion_del_plano" "enum_cirugias_pasos_accion_del_plano";
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "musculo_del_plano" varchar;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "accion_del_plano" "enum__cirugias_v_version_pasos_accion_del_plano";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_pasos" ALTER COLUMN "objetivo" SET DATA TYPE text;
  ALTER TABLE "cirugias_pasos" ALTER COLUMN "objetivo" SET DEFAULT 'instrumento'::text;
  DROP TYPE "public"."enum_cirugias_pasos_objetivo";
  CREATE TYPE "public"."enum_cirugias_pasos_objetivo" AS ENUM('instrumento', 'trazo', 'reduccion', 'fuerza', 'perforacion', 'fijacion');
  ALTER TABLE "cirugias_pasos" ALTER COLUMN "objetivo" SET DEFAULT 'instrumento'::"public"."enum_cirugias_pasos_objetivo";
  ALTER TABLE "cirugias_pasos" ALTER COLUMN "objetivo" SET DATA TYPE "public"."enum_cirugias_pasos_objetivo" USING "objetivo"::"public"."enum_cirugias_pasos_objetivo";
  ALTER TABLE "_cirugias_v_version_pasos" ALTER COLUMN "objetivo" SET DATA TYPE text;
  ALTER TABLE "_cirugias_v_version_pasos" ALTER COLUMN "objetivo" SET DEFAULT 'instrumento'::text;
  DROP TYPE "public"."enum__cirugias_v_version_pasos_objetivo";
  CREATE TYPE "public"."enum__cirugias_v_version_pasos_objetivo" AS ENUM('instrumento', 'trazo', 'reduccion', 'fuerza', 'perforacion', 'fijacion');
  ALTER TABLE "_cirugias_v_version_pasos" ALTER COLUMN "objetivo" SET DEFAULT 'instrumento'::"public"."enum__cirugias_v_version_pasos_objetivo";
  ALTER TABLE "_cirugias_v_version_pasos" ALTER COLUMN "objetivo" SET DATA TYPE "public"."enum__cirugias_v_version_pasos_objetivo" USING "objetivo"::"public"."enum__cirugias_v_version_pasos_objetivo";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "musculo_del_plano";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "accion_del_plano";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "musculo_del_plano";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "accion_del_plano";
  DROP TYPE "public"."enum_cirugias_pasos_accion_del_plano";
  DROP TYPE "public"."enum__cirugias_v_version_pasos_accion_del_plano";`)
}
