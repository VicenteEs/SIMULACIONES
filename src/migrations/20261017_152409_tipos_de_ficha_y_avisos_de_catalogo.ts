import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * P-003, E1 (D-177): el tipo de una patología pasa de un valor fijo a un catálogo, y los avisos de filas nuevas de
 * un catálogo cuelgan de la propia fila.
 *
 * Lo generó `payload migrate:create`; a mano está solo lo que el generador no sabe hacer: **llevar el valor de cada
 * patología al catálogo antes de soltar la columna vieja**. Sin eso, la migración borraba el tipo de todas las
 * fichas existentes y la biblioteca dejaba de poder filtrarlas por «trauma» y «ortopedia» sin que nada fallara.
 * Se hace también en las versiones (`_patologias_v`): un borrador anterior que se restaure vuelve con su tipo.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_comentarios_coleccion" ADD VALUE 'huesos-ao';
  ALTER TYPE "public"."enum_comentarios_coleccion" ADD VALUE 'clasificaciones-ao';
  ALTER TYPE "public"."enum_comentarios_coleccion" ADD VALUE 'tecnicas-quirurgicas';
  ALTER TYPE "public"."enum_comentarios_coleccion" ADD VALUE 'fases-quirurgicas';
  ALTER TYPE "public"."enum_comentarios_coleccion" ADD VALUE 'segmentos';
  ALTER TYPE "public"."enum_comentarios_coleccion" ADD VALUE 'tipos-de-ficha';
  CREATE TABLE "tipos_de_ficha" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"orden" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "patologias" ADD COLUMN "tipo_id" integer;
  ALTER TABLE "_patologias_v" ADD COLUMN "version_tipo_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tipos_de_ficha_id" integer;
  CREATE INDEX "tipos_de_ficha_nombre_idx" ON "tipos_de_ficha" USING btree ("nombre");
  CREATE INDEX "tipos_de_ficha_updated_at_idx" ON "tipos_de_ficha" USING btree ("updated_at");
  CREATE INDEX "tipos_de_ficha_created_at_idx" ON "tipos_de_ficha" USING btree ("created_at");
  ALTER TABLE "patologias" ADD CONSTRAINT "patologias_tipo_id_tipos_de_ficha_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipos_de_ficha"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_patologias_v" ADD CONSTRAINT "_patologias_v_version_tipo_id_tipos_de_ficha_id_fk" FOREIGN KEY ("version_tipo_id") REFERENCES "public"."tipos_de_ficha"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tipos_de_ficha_fk" FOREIGN KEY ("tipos_de_ficha_id") REFERENCES "public"."tipos_de_ficha"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "patologias_tipo_idx" ON "patologias" USING btree ("tipo_id");
  CREATE INDEX "_patologias_v_version_version_tipo_idx" ON "_patologias_v" USING btree ("version_tipo_id");
  CREATE INDEX "payload_locked_documents_rels_tipos_de_ficha_id_idx" ON "payload_locked_documents_rels" USING btree ("tipos_de_ficha_id");

  INSERT INTO "tipos_de_ficha" ("nombre", "orden") VALUES ('Trauma', 10), ('Ortopedia', 20);
  UPDATE "patologias" SET "tipo_id" = (
    SELECT "id" FROM "tipos_de_ficha" WHERE "nombre" = CASE "patologias"."tipo"::text WHEN 'trauma' THEN 'Trauma' WHEN 'ortopedia' THEN 'Ortopedia' END
  ) WHERE "tipo" IS NOT NULL;
  UPDATE "_patologias_v" SET "version_tipo_id" = (
    SELECT "id" FROM "tipos_de_ficha" WHERE "nombre" = CASE "_patologias_v"."version_tipo"::text WHEN 'trauma' THEN 'Trauma' WHEN 'ortopedia' THEN 'Ortopedia' END
  ) WHERE "version_tipo" IS NOT NULL;

  ALTER TABLE "patologias" DROP COLUMN "tipo";
  ALTER TABLE "_patologias_v" DROP COLUMN "version_tipo";
  DROP TYPE "public"."enum_patologias_tipo";
  DROP TYPE "public"."enum__patologias_v_version_tipo";`)
}

/**
 * Deshacer pierde dos cosas, y las dos se dicen aquí: los tipos que no sean «Trauma» ni «Ortopedia» vuelven como
 * «trauma» (el enumerado solo tiene esos dos), y los comentarios de aviso de catálogo se borran (el enumerado de
 * `comentarios.coleccion` ya no tiene sus valores y PostgreSQL no convierte lo que no cabe).
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_patologias_tipo" AS ENUM('trauma', 'ortopedia');
  CREATE TYPE "public"."enum__patologias_v_version_tipo" AS ENUM('trauma', 'ortopedia');
  ALTER TABLE "patologias" ADD COLUMN "tipo" "enum_patologias_tipo" DEFAULT 'trauma';
  ALTER TABLE "_patologias_v" ADD COLUMN "version_tipo" "enum__patologias_v_version_tipo" DEFAULT 'trauma';
  UPDATE "patologias" SET "tipo" = (CASE (SELECT "nombre" FROM "tipos_de_ficha" WHERE "id" = "patologias"."tipo_id")
    WHEN 'Ortopedia' THEN 'ortopedia' ELSE 'trauma' END)::"enum_patologias_tipo";
  UPDATE "_patologias_v" SET "version_tipo" = (CASE (SELECT "nombre" FROM "tipos_de_ficha" WHERE "id" = "_patologias_v"."version_tipo_id")
    WHEN 'Ortopedia' THEN 'ortopedia' ELSE 'trauma' END)::"enum__patologias_v_version_tipo";
  DELETE FROM "comentarios" WHERE "coleccion"::text IN ('huesos-ao', 'clasificaciones-ao', 'tecnicas-quirurgicas', 'fases-quirurgicas', 'segmentos', 'tipos-de-ficha');
  ALTER TABLE "patologias" DROP CONSTRAINT "patologias_tipo_id_tipos_de_ficha_id_fk";

  ALTER TABLE "_patologias_v" DROP CONSTRAINT "_patologias_v_version_tipo_id_tipos_de_ficha_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tipos_de_ficha_fk";

  ALTER TABLE "comentarios" ALTER COLUMN "coleccion" SET DATA TYPE text;
  DROP TYPE "public"."enum_comentarios_coleccion";
  CREATE TYPE "public"."enum_comentarios_coleccion" AS ENUM('patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia', 'instancias-atlas');
  ALTER TABLE "comentarios" ALTER COLUMN "coleccion" SET DATA TYPE "public"."enum_comentarios_coleccion" USING "coleccion"::"public"."enum_comentarios_coleccion";
  DROP INDEX "patologias_tipo_idx";
  DROP INDEX "_patologias_v_version_version_tipo_idx";
  DROP INDEX "payload_locked_documents_rels_tipos_de_ficha_id_idx";
  ALTER TABLE "patologias" DROP COLUMN "tipo_id";
  ALTER TABLE "_patologias_v" DROP COLUMN "version_tipo_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tipos_de_ficha_id";
  ALTER TABLE "tipos_de_ficha" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tipos_de_ficha" CASCADE;`)
}
