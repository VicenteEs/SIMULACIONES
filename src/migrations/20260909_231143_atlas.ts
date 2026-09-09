import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "instancias_atlas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"descripcion" varchar,
  	"segmento_id" integer,
  	"numero_de_piezas" numeric,
  	"contenido" jsonb NOT NULL,
  	"atlas_version" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "patologias_blocks_instancia_atlas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"preparacion_id" integer,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_patologias_v_blocks_instancia_atlas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"preparacion_id" integer,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "maniobras_blocks_instancia_atlas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"preparacion_id" integer,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_maniobras_v_blocks_instancia_atlas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"preparacion_id" integer,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "casos_ao_blocks_instancia_atlas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"preparacion_id" integer,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_instancia_atlas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"preparacion_id" integer,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cirugias_blocks_instancia_atlas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"preparacion_id" integer,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_instancia_atlas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"preparacion_id" integer,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "estudios_ia_blocks_instancia_atlas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"preparacion_id" integer,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_instancia_atlas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"preparacion_id" integer,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "instancias_atlas_id" integer;
  ALTER TABLE "instancias_atlas" ADD CONSTRAINT "instancias_atlas_segmento_id_segmentos_id_fk" FOREIGN KEY ("segmento_id") REFERENCES "public"."segmentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "patologias_blocks_instancia_atlas" ADD CONSTRAINT "patologias_blocks_instancia_atlas_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "patologias_blocks_instancia_atlas" ADD CONSTRAINT "patologias_blocks_instancia_atlas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_instancia_atlas" ADD CONSTRAINT "_patologias_v_blocks_instancia_atlas_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_instancia_atlas" ADD CONSTRAINT "_patologias_v_blocks_instancia_atlas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_instancia_atlas" ADD CONSTRAINT "maniobras_blocks_instancia_atlas_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_instancia_atlas" ADD CONSTRAINT "maniobras_blocks_instancia_atlas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_instancia_atlas" ADD CONSTRAINT "_maniobras_v_blocks_instancia_atlas_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_instancia_atlas" ADD CONSTRAINT "_maniobras_v_blocks_instancia_atlas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_instancia_atlas" ADD CONSTRAINT "casos_ao_blocks_instancia_atlas_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_instancia_atlas" ADD CONSTRAINT "casos_ao_blocks_instancia_atlas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_instancia_atlas" ADD CONSTRAINT "_casos_ao_v_blocks_instancia_atlas_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_instancia_atlas" ADD CONSTRAINT "_casos_ao_v_blocks_instancia_atlas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_instancia_atlas" ADD CONSTRAINT "cirugias_blocks_instancia_atlas_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_instancia_atlas" ADD CONSTRAINT "cirugias_blocks_instancia_atlas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_instancia_atlas" ADD CONSTRAINT "_cirugias_v_blocks_instancia_atlas_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_instancia_atlas" ADD CONSTRAINT "_cirugias_v_blocks_instancia_atlas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_instancia_atlas" ADD CONSTRAINT "estudios_ia_blocks_instancia_atlas_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_instancia_atlas" ADD CONSTRAINT "estudios_ia_blocks_instancia_atlas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_instancia_atlas" ADD CONSTRAINT "_estudios_ia_v_blocks_instancia_atlas_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_instancia_atlas" ADD CONSTRAINT "_estudios_ia_v_blocks_instancia_atlas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "instancias_atlas_segmento_idx" ON "instancias_atlas" USING btree ("segmento_id");
  CREATE INDEX "instancias_atlas_updated_at_idx" ON "instancias_atlas" USING btree ("updated_at");
  CREATE INDEX "instancias_atlas_created_at_idx" ON "instancias_atlas" USING btree ("created_at");
  CREATE INDEX "patologias_blocks_instancia_atlas_order_idx" ON "patologias_blocks_instancia_atlas" USING btree ("_order");
  CREATE INDEX "patologias_blocks_instancia_atlas_parent_id_idx" ON "patologias_blocks_instancia_atlas" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_instancia_atlas_path_idx" ON "patologias_blocks_instancia_atlas" USING btree ("_path");
  CREATE INDEX "patologias_blocks_instancia_atlas_preparacion_idx" ON "patologias_blocks_instancia_atlas" USING btree ("preparacion_id");
  CREATE INDEX "_patologias_v_blocks_instancia_atlas_order_idx" ON "_patologias_v_blocks_instancia_atlas" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_instancia_atlas_parent_id_idx" ON "_patologias_v_blocks_instancia_atlas" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_instancia_atlas_path_idx" ON "_patologias_v_blocks_instancia_atlas" USING btree ("_path");
  CREATE INDEX "_patologias_v_blocks_instancia_atlas_preparacion_idx" ON "_patologias_v_blocks_instancia_atlas" USING btree ("preparacion_id");
  CREATE INDEX "maniobras_blocks_instancia_atlas_order_idx" ON "maniobras_blocks_instancia_atlas" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_instancia_atlas_parent_id_idx" ON "maniobras_blocks_instancia_atlas" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_instancia_atlas_path_idx" ON "maniobras_blocks_instancia_atlas" USING btree ("_path");
  CREATE INDEX "maniobras_blocks_instancia_atlas_preparacion_idx" ON "maniobras_blocks_instancia_atlas" USING btree ("preparacion_id");
  CREATE INDEX "_maniobras_v_blocks_instancia_atlas_order_idx" ON "_maniobras_v_blocks_instancia_atlas" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_instancia_atlas_parent_id_idx" ON "_maniobras_v_blocks_instancia_atlas" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_instancia_atlas_path_idx" ON "_maniobras_v_blocks_instancia_atlas" USING btree ("_path");
  CREATE INDEX "_maniobras_v_blocks_instancia_atlas_preparacion_idx" ON "_maniobras_v_blocks_instancia_atlas" USING btree ("preparacion_id");
  CREATE INDEX "casos_ao_blocks_instancia_atlas_order_idx" ON "casos_ao_blocks_instancia_atlas" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_instancia_atlas_parent_id_idx" ON "casos_ao_blocks_instancia_atlas" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_instancia_atlas_path_idx" ON "casos_ao_blocks_instancia_atlas" USING btree ("_path");
  CREATE INDEX "casos_ao_blocks_instancia_atlas_preparacion_idx" ON "casos_ao_blocks_instancia_atlas" USING btree ("preparacion_id");
  CREATE INDEX "_casos_ao_v_blocks_instancia_atlas_order_idx" ON "_casos_ao_v_blocks_instancia_atlas" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_instancia_atlas_parent_id_idx" ON "_casos_ao_v_blocks_instancia_atlas" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_instancia_atlas_path_idx" ON "_casos_ao_v_blocks_instancia_atlas" USING btree ("_path");
  CREATE INDEX "_casos_ao_v_blocks_instancia_atlas_preparacion_idx" ON "_casos_ao_v_blocks_instancia_atlas" USING btree ("preparacion_id");
  CREATE INDEX "cirugias_blocks_instancia_atlas_order_idx" ON "cirugias_blocks_instancia_atlas" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_instancia_atlas_parent_id_idx" ON "cirugias_blocks_instancia_atlas" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_instancia_atlas_path_idx" ON "cirugias_blocks_instancia_atlas" USING btree ("_path");
  CREATE INDEX "cirugias_blocks_instancia_atlas_preparacion_idx" ON "cirugias_blocks_instancia_atlas" USING btree ("preparacion_id");
  CREATE INDEX "_cirugias_v_blocks_instancia_atlas_order_idx" ON "_cirugias_v_blocks_instancia_atlas" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_instancia_atlas_parent_id_idx" ON "_cirugias_v_blocks_instancia_atlas" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_instancia_atlas_path_idx" ON "_cirugias_v_blocks_instancia_atlas" USING btree ("_path");
  CREATE INDEX "_cirugias_v_blocks_instancia_atlas_preparacion_idx" ON "_cirugias_v_blocks_instancia_atlas" USING btree ("preparacion_id");
  CREATE INDEX "estudios_ia_blocks_instancia_atlas_order_idx" ON "estudios_ia_blocks_instancia_atlas" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_instancia_atlas_parent_id_idx" ON "estudios_ia_blocks_instancia_atlas" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_instancia_atlas_path_idx" ON "estudios_ia_blocks_instancia_atlas" USING btree ("_path");
  CREATE INDEX "estudios_ia_blocks_instancia_atlas_preparacion_idx" ON "estudios_ia_blocks_instancia_atlas" USING btree ("preparacion_id");
  CREATE INDEX "_estudios_ia_v_blocks_instancia_atlas_order_idx" ON "_estudios_ia_v_blocks_instancia_atlas" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_instancia_atlas_parent_id_idx" ON "_estudios_ia_v_blocks_instancia_atlas" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_instancia_atlas_path_idx" ON "_estudios_ia_v_blocks_instancia_atlas" USING btree ("_path");
  CREATE INDEX "_estudios_ia_v_blocks_instancia_atlas_preparacion_idx" ON "_estudios_ia_v_blocks_instancia_atlas" USING btree ("preparacion_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_instancias_atlas_fk" FOREIGN KEY ("instancias_atlas_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_instancias_atlas_id_idx" ON "payload_locked_documents_rels" USING btree ("instancias_atlas_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "instancias_atlas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "patologias_blocks_instancia_atlas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_patologias_v_blocks_instancia_atlas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "maniobras_blocks_instancia_atlas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_maniobras_v_blocks_instancia_atlas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "casos_ao_blocks_instancia_atlas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_casos_ao_v_blocks_instancia_atlas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cirugias_blocks_instancia_atlas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_cirugias_v_blocks_instancia_atlas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "estudios_ia_blocks_instancia_atlas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_estudios_ia_v_blocks_instancia_atlas" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "instancias_atlas" CASCADE;
  DROP TABLE "patologias_blocks_instancia_atlas" CASCADE;
  DROP TABLE "_patologias_v_blocks_instancia_atlas" CASCADE;
  DROP TABLE "maniobras_blocks_instancia_atlas" CASCADE;
  DROP TABLE "_maniobras_v_blocks_instancia_atlas" CASCADE;
  DROP TABLE "casos_ao_blocks_instancia_atlas" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_instancia_atlas" CASCADE;
  DROP TABLE "cirugias_blocks_instancia_atlas" CASCADE;
  DROP TABLE "_cirugias_v_blocks_instancia_atlas" CASCADE;
  DROP TABLE "estudios_ia_blocks_instancia_atlas" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_instancia_atlas" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_instancias_atlas_fk";
  
  DROP INDEX "payload_locked_documents_rels_instancias_atlas_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "instancias_atlas_id";`)
}
