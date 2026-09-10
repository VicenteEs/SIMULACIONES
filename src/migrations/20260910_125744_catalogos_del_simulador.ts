import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_clasificaciones_ao_tipo" AS ENUM('A', 'B', 'C');
  CREATE TYPE "public"."enum_instrumental_icono" AS ENUM('generico', 'bisturi', 'separador', 'pinza', 'tijera', 'punzon', 'guia', 'fresa', 'martillo', 'atornillador', 'aguja');
  CREATE TABLE "huesos_ao" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"codigo" varchar,
  	"orden" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "clasificaciones_ao" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"codigo" varchar NOT NULL,
  	"nombre" varchar NOT NULL,
  	"tipo" "enum_clasificaciones_ao_tipo",
  	"descripcion" varchar,
  	"orden" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tecnicas_quirurgicas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"descripcion" varchar,
  	"orden" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "fases_quirurgicas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"orden" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "instrumental" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"icono" "enum_instrumental_icono" DEFAULT 'generico',
  	"descripcion" varchar,
  	"orden" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "instrumental_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tecnicas_quirurgicas_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "huesos_ao_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "clasificaciones_ao_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tecnicas_quirurgicas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "fases_quirurgicas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "instrumental_id" integer;
  ALTER TABLE "instrumental_rels" ADD CONSTRAINT "instrumental_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."instrumental"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "instrumental_rels" ADD CONSTRAINT "instrumental_rels_tecnicas_quirurgicas_fk" FOREIGN KEY ("tecnicas_quirurgicas_id") REFERENCES "public"."tecnicas_quirurgicas"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "huesos_ao_nombre_idx" ON "huesos_ao" USING btree ("nombre");
  CREATE INDEX "huesos_ao_updated_at_idx" ON "huesos_ao" USING btree ("updated_at");
  CREATE INDEX "huesos_ao_created_at_idx" ON "huesos_ao" USING btree ("created_at");
  CREATE INDEX "clasificaciones_ao_codigo_idx" ON "clasificaciones_ao" USING btree ("codigo");
  CREATE INDEX "clasificaciones_ao_updated_at_idx" ON "clasificaciones_ao" USING btree ("updated_at");
  CREATE INDEX "clasificaciones_ao_created_at_idx" ON "clasificaciones_ao" USING btree ("created_at");
  CREATE INDEX "tecnicas_quirurgicas_nombre_idx" ON "tecnicas_quirurgicas" USING btree ("nombre");
  CREATE INDEX "tecnicas_quirurgicas_updated_at_idx" ON "tecnicas_quirurgicas" USING btree ("updated_at");
  CREATE INDEX "tecnicas_quirurgicas_created_at_idx" ON "tecnicas_quirurgicas" USING btree ("created_at");
  CREATE INDEX "fases_quirurgicas_nombre_idx" ON "fases_quirurgicas" USING btree ("nombre");
  CREATE INDEX "fases_quirurgicas_updated_at_idx" ON "fases_quirurgicas" USING btree ("updated_at");
  CREATE INDEX "fases_quirurgicas_created_at_idx" ON "fases_quirurgicas" USING btree ("created_at");
  CREATE INDEX "instrumental_nombre_idx" ON "instrumental" USING btree ("nombre");
  CREATE INDEX "instrumental_updated_at_idx" ON "instrumental" USING btree ("updated_at");
  CREATE INDEX "instrumental_created_at_idx" ON "instrumental" USING btree ("created_at");
  CREATE INDEX "instrumental_rels_order_idx" ON "instrumental_rels" USING btree ("order");
  CREATE INDEX "instrumental_rels_parent_idx" ON "instrumental_rels" USING btree ("parent_id");
  CREATE INDEX "instrumental_rels_path_idx" ON "instrumental_rels" USING btree ("path");
  CREATE INDEX "instrumental_rels_tecnicas_quirurgicas_id_idx" ON "instrumental_rels" USING btree ("tecnicas_quirurgicas_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_huesos_ao_fk" FOREIGN KEY ("huesos_ao_id") REFERENCES "public"."huesos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_clasificaciones_ao_fk" FOREIGN KEY ("clasificaciones_ao_id") REFERENCES "public"."clasificaciones_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tecnicas_quirurgicas_fk" FOREIGN KEY ("tecnicas_quirurgicas_id") REFERENCES "public"."tecnicas_quirurgicas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fases_quirurgicas_fk" FOREIGN KEY ("fases_quirurgicas_id") REFERENCES "public"."fases_quirurgicas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_instrumental_fk" FOREIGN KEY ("instrumental_id") REFERENCES "public"."instrumental"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_huesos_ao_id_idx" ON "payload_locked_documents_rels" USING btree ("huesos_ao_id");
  CREATE INDEX "payload_locked_documents_rels_clasificaciones_ao_id_idx" ON "payload_locked_documents_rels" USING btree ("clasificaciones_ao_id");
  CREATE INDEX "payload_locked_documents_rels_tecnicas_quirurgicas_id_idx" ON "payload_locked_documents_rels" USING btree ("tecnicas_quirurgicas_id");
  CREATE INDEX "payload_locked_documents_rels_fases_quirurgicas_id_idx" ON "payload_locked_documents_rels" USING btree ("fases_quirurgicas_id");
  CREATE INDEX "payload_locked_documents_rels_instrumental_id_idx" ON "payload_locked_documents_rels" USING btree ("instrumental_id");
  ALTER TABLE "cirugias_pasos" DROP COLUMN "instrumento";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "instrumento";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "huesos_ao" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "clasificaciones_ao" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tecnicas_quirurgicas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "fases_quirurgicas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "instrumental" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "instrumental_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "huesos_ao" CASCADE;
  DROP TABLE "clasificaciones_ao" CASCADE;
  DROP TABLE "tecnicas_quirurgicas" CASCADE;
  DROP TABLE "fases_quirurgicas" CASCADE;
  DROP TABLE "instrumental" CASCADE;
  DROP TABLE "instrumental_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_huesos_ao_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_clasificaciones_ao_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tecnicas_quirurgicas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fases_quirurgicas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_instrumental_fk";
  
  DROP INDEX "payload_locked_documents_rels_huesos_ao_id_idx";
  DROP INDEX "payload_locked_documents_rels_clasificaciones_ao_id_idx";
  DROP INDEX "payload_locked_documents_rels_tecnicas_quirurgicas_id_idx";
  DROP INDEX "payload_locked_documents_rels_fases_quirurgicas_id_idx";
  DROP INDEX "payload_locked_documents_rels_instrumental_id_idx";
  ALTER TABLE "cirugias_pasos" ADD COLUMN "instrumento" varchar;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "instrumento" varchar;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "huesos_ao_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "clasificaciones_ao_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tecnicas_quirurgicas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "fases_quirurgicas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "instrumental_id";
  DROP TYPE "public"."enum_clasificaciones_ao_tipo";
  DROP TYPE "public"."enum_instrumental_icono";`)
}
