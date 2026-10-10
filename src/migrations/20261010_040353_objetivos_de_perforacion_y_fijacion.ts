import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_cirugias_pasos_objetivo" ADD VALUE 'perforacion';
  ALTER TYPE "public"."enum_cirugias_pasos_objetivo" ADD VALUE 'fijacion';
  ALTER TYPE "public"."enum__cirugias_v_version_pasos_objetivo" ADD VALUE 'perforacion';
  ALTER TYPE "public"."enum__cirugias_v_version_pasos_objetivo" ADD VALUE 'fijacion';
  ALTER TABLE "cirugias_pasos" ADD COLUMN "calibre_broca" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "angulo_minimo" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "angulo_maximo" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "tornillos_minimos" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "exige_bicortical" boolean;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "calibre_broca" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "angulo_minimo" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "angulo_maximo" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "tornillos_minimos" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "exige_bicortical" boolean;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_pasos" ALTER COLUMN "objetivo" SET DATA TYPE text;
  ALTER TABLE "cirugias_pasos" ALTER COLUMN "objetivo" SET DEFAULT 'instrumento'::text;
  DROP TYPE "public"."enum_cirugias_pasos_objetivo";
  CREATE TYPE "public"."enum_cirugias_pasos_objetivo" AS ENUM('instrumento', 'trazo', 'reduccion', 'fuerza');
  ALTER TABLE "cirugias_pasos" ALTER COLUMN "objetivo" SET DEFAULT 'instrumento'::"public"."enum_cirugias_pasos_objetivo";
  ALTER TABLE "cirugias_pasos" ALTER COLUMN "objetivo" SET DATA TYPE "public"."enum_cirugias_pasos_objetivo" USING "objetivo"::"public"."enum_cirugias_pasos_objetivo";
  ALTER TABLE "_cirugias_v_version_pasos" ALTER COLUMN "objetivo" SET DATA TYPE text;
  ALTER TABLE "_cirugias_v_version_pasos" ALTER COLUMN "objetivo" SET DEFAULT 'instrumento'::text;
  DROP TYPE "public"."enum__cirugias_v_version_pasos_objetivo";
  CREATE TYPE "public"."enum__cirugias_v_version_pasos_objetivo" AS ENUM('instrumento', 'trazo', 'reduccion', 'fuerza');
  ALTER TABLE "_cirugias_v_version_pasos" ALTER COLUMN "objetivo" SET DEFAULT 'instrumento'::"public"."enum__cirugias_v_version_pasos_objetivo";
  ALTER TABLE "_cirugias_v_version_pasos" ALTER COLUMN "objetivo" SET DATA TYPE "public"."enum__cirugias_v_version_pasos_objetivo" USING "objetivo"::"public"."enum__cirugias_v_version_pasos_objetivo";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "calibre_broca";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "angulo_minimo";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "angulo_maximo";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "tornillos_minimos";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "exige_bicortical";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "calibre_broca";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "angulo_minimo";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "angulo_maximo";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "tornillos_minimos";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "exige_bicortical";`)
}
