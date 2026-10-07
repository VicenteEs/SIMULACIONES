import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_requisitos_modulo" AS ENUM('planificacion');
  CREATE TYPE "public"."enum_requisitos_estado" AS ENUM('propuesto', 'en-estudio', 'aceptado', 'hecho', 'descartado');
  CREATE TABLE "requisitos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar NOT NULL,
  	"descripcion" varchar NOT NULL,
  	"modulo" "enum_requisitos_modulo" DEFAULT 'planificacion' NOT NULL,
  	"autor_id" integer,
  	"estado" "enum_requisitos_estado" DEFAULT 'propuesto' NOT NULL,
  	"respuesta" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "requisitos_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"usuarios_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "requisitos_id" integer;
  ALTER TABLE "requisitos" ADD CONSTRAINT "requisitos_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "requisitos_rels" ADD CONSTRAINT "requisitos_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."requisitos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "requisitos_rels" ADD CONSTRAINT "requisitos_rels_usuarios_fk" FOREIGN KEY ("usuarios_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "requisitos_autor_idx" ON "requisitos" USING btree ("autor_id");
  CREATE INDEX "requisitos_updated_at_idx" ON "requisitos" USING btree ("updated_at");
  CREATE INDEX "requisitos_created_at_idx" ON "requisitos" USING btree ("created_at");
  CREATE INDEX "requisitos_rels_order_idx" ON "requisitos_rels" USING btree ("order");
  CREATE INDEX "requisitos_rels_parent_idx" ON "requisitos_rels" USING btree ("parent_id");
  CREATE INDEX "requisitos_rels_path_idx" ON "requisitos_rels" USING btree ("path");
  CREATE INDEX "requisitos_rels_usuarios_id_idx" ON "requisitos_rels" USING btree ("usuarios_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_requisitos_fk" FOREIGN KEY ("requisitos_id") REFERENCES "public"."requisitos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_requisitos_id_idx" ON "payload_locked_documents_rels" USING btree ("requisitos_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "requisitos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "requisitos_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "requisitos" CASCADE;
  DROP TABLE "requisitos_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_requisitos_fk";
  
  DROP INDEX "payload_locked_documents_rels_requisitos_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "requisitos_id";
  DROP TYPE "public"."enum_requisitos_modulo";
  DROP TYPE "public"."enum_requisitos_estado";`)
}
