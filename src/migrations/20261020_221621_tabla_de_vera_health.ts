import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "patologias_blocks_tabla_vera_health" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"tabla" varchar,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_patologias_v_blocks_tabla_vera_health" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"tabla" varchar,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "maniobras_blocks_tabla_vera_health" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"tabla" varchar,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_maniobras_v_blocks_tabla_vera_health" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"tabla" varchar,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "casos_ao_blocks_tabla_vera_health" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"tabla" varchar,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_tabla_vera_health" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"tabla" varchar,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cirugias_blocks_tabla_vera_health" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"tabla" varchar,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_tabla_vera_health" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"tabla" varchar,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "estudios_ia_blocks_tabla_vera_health" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"tabla" varchar,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_tabla_vera_health" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"tabla" varchar,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "patologias_blocks_tabla_vera_health" ADD CONSTRAINT "patologias_blocks_tabla_vera_health_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_tabla_vera_health" ADD CONSTRAINT "_patologias_v_blocks_tabla_vera_health_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_tabla_vera_health" ADD CONSTRAINT "maniobras_blocks_tabla_vera_health_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_tabla_vera_health" ADD CONSTRAINT "_maniobras_v_blocks_tabla_vera_health_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_tabla_vera_health" ADD CONSTRAINT "casos_ao_blocks_tabla_vera_health_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_tabla_vera_health" ADD CONSTRAINT "_casos_ao_v_blocks_tabla_vera_health_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_tabla_vera_health" ADD CONSTRAINT "cirugias_blocks_tabla_vera_health_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_tabla_vera_health" ADD CONSTRAINT "_cirugias_v_blocks_tabla_vera_health_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_tabla_vera_health" ADD CONSTRAINT "estudios_ia_blocks_tabla_vera_health_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_tabla_vera_health" ADD CONSTRAINT "_estudios_ia_v_blocks_tabla_vera_health_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "patologias_blocks_tabla_vera_health_order_idx" ON "patologias_blocks_tabla_vera_health" USING btree ("_order");
  CREATE INDEX "patologias_blocks_tabla_vera_health_parent_id_idx" ON "patologias_blocks_tabla_vera_health" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_tabla_vera_health_path_idx" ON "patologias_blocks_tabla_vera_health" USING btree ("_path");
  CREATE INDEX "_patologias_v_blocks_tabla_vera_health_order_idx" ON "_patologias_v_blocks_tabla_vera_health" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_tabla_vera_health_parent_id_idx" ON "_patologias_v_blocks_tabla_vera_health" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_tabla_vera_health_path_idx" ON "_patologias_v_blocks_tabla_vera_health" USING btree ("_path");
  CREATE INDEX "maniobras_blocks_tabla_vera_health_order_idx" ON "maniobras_blocks_tabla_vera_health" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_tabla_vera_health_parent_id_idx" ON "maniobras_blocks_tabla_vera_health" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_tabla_vera_health_path_idx" ON "maniobras_blocks_tabla_vera_health" USING btree ("_path");
  CREATE INDEX "_maniobras_v_blocks_tabla_vera_health_order_idx" ON "_maniobras_v_blocks_tabla_vera_health" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_tabla_vera_health_parent_id_idx" ON "_maniobras_v_blocks_tabla_vera_health" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_tabla_vera_health_path_idx" ON "_maniobras_v_blocks_tabla_vera_health" USING btree ("_path");
  CREATE INDEX "casos_ao_blocks_tabla_vera_health_order_idx" ON "casos_ao_blocks_tabla_vera_health" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_tabla_vera_health_parent_id_idx" ON "casos_ao_blocks_tabla_vera_health" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_tabla_vera_health_path_idx" ON "casos_ao_blocks_tabla_vera_health" USING btree ("_path");
  CREATE INDEX "_casos_ao_v_blocks_tabla_vera_health_order_idx" ON "_casos_ao_v_blocks_tabla_vera_health" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_tabla_vera_health_parent_id_idx" ON "_casos_ao_v_blocks_tabla_vera_health" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_tabla_vera_health_path_idx" ON "_casos_ao_v_blocks_tabla_vera_health" USING btree ("_path");
  CREATE INDEX "cirugias_blocks_tabla_vera_health_order_idx" ON "cirugias_blocks_tabla_vera_health" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_tabla_vera_health_parent_id_idx" ON "cirugias_blocks_tabla_vera_health" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_tabla_vera_health_path_idx" ON "cirugias_blocks_tabla_vera_health" USING btree ("_path");
  CREATE INDEX "_cirugias_v_blocks_tabla_vera_health_order_idx" ON "_cirugias_v_blocks_tabla_vera_health" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_tabla_vera_health_parent_id_idx" ON "_cirugias_v_blocks_tabla_vera_health" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_tabla_vera_health_path_idx" ON "_cirugias_v_blocks_tabla_vera_health" USING btree ("_path");
  CREATE INDEX "estudios_ia_blocks_tabla_vera_health_order_idx" ON "estudios_ia_blocks_tabla_vera_health" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_tabla_vera_health_parent_id_idx" ON "estudios_ia_blocks_tabla_vera_health" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_tabla_vera_health_path_idx" ON "estudios_ia_blocks_tabla_vera_health" USING btree ("_path");
  CREATE INDEX "_estudios_ia_v_blocks_tabla_vera_health_order_idx" ON "_estudios_ia_v_blocks_tabla_vera_health" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_tabla_vera_health_parent_id_idx" ON "_estudios_ia_v_blocks_tabla_vera_health" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_tabla_vera_health_path_idx" ON "_estudios_ia_v_blocks_tabla_vera_health" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "patologias_blocks_tabla_vera_health" CASCADE;
  DROP TABLE "_patologias_v_blocks_tabla_vera_health" CASCADE;
  DROP TABLE "maniobras_blocks_tabla_vera_health" CASCADE;
  DROP TABLE "_maniobras_v_blocks_tabla_vera_health" CASCADE;
  DROP TABLE "casos_ao_blocks_tabla_vera_health" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_tabla_vera_health" CASCADE;
  DROP TABLE "cirugias_blocks_tabla_vera_health" CASCADE;
  DROP TABLE "_cirugias_v_blocks_tabla_vera_health" CASCADE;
  DROP TABLE "estudios_ia_blocks_tabla_vera_health" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_tabla_vera_health" CASCADE;`)
}
