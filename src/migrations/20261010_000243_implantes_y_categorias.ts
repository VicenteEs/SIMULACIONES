import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_instrumental_categoria" ADD VALUE 'placas';
  ALTER TYPE "public"."enum_instrumental_categoria" ADD VALUE 'tornillos';
  ALTER TYPE "public"."enum_instrumental_categoria" ADD VALUE 'clavos';
  ALTER TYPE "public"."enum_instrumental_categoria" ADD VALUE 'injerto';
  ALTER TYPE "public"."enum_instrumental_icono" ADD VALUE 'placa';
  ALTER TYPE "public"."enum_instrumental_icono" ADD VALUE 'tornillo';
  ALTER TYPE "public"."enum_instrumental_icono" ADD VALUE 'clavo';
  ALTER TYPE "public"."enum_instrumental_icono" ADD VALUE 'injerto';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "instrumental" ALTER COLUMN "categoria" SET DATA TYPE text;
  ALTER TABLE "instrumental" ALTER COLUMN "categoria" SET DEFAULT 'fijacion'::text;
  DROP TYPE "public"."enum_instrumental_categoria";
  CREATE TYPE "public"."enum_instrumental_categoria" AS ENUM('corte', 'suturas', 'exposicion', 'periostio', 'reduccion', 'fijacion', 'modelado', 'enclavado');
  ALTER TABLE "instrumental" ALTER COLUMN "categoria" SET DEFAULT 'fijacion'::"public"."enum_instrumental_categoria";
  ALTER TABLE "instrumental" ALTER COLUMN "categoria" SET DATA TYPE "public"."enum_instrumental_categoria" USING "categoria"::"public"."enum_instrumental_categoria";
  ALTER TABLE "instrumental" ALTER COLUMN "icono" SET DATA TYPE text;
  ALTER TABLE "instrumental" ALTER COLUMN "icono" SET DEFAULT 'generico'::text;
  DROP TYPE "public"."enum_instrumental_icono";
  CREATE TYPE "public"."enum_instrumental_icono" AS ENUM('generico', 'bisturi', 'separador', 'pinza', 'tijera', 'punzon', 'guia', 'fresa', 'martillo', 'atornillador', 'aguja');
  ALTER TABLE "instrumental" ALTER COLUMN "icono" SET DEFAULT 'generico'::"public"."enum_instrumental_icono";
  ALTER TABLE "instrumental" ALTER COLUMN "icono" SET DATA TYPE "public"."enum_instrumental_icono" USING "icono"::"public"."enum_instrumental_icono";`)
}
