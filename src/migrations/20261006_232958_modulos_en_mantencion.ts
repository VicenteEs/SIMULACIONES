import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ajustes_modulos_en_mantencion" AS ENUM('patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia');
  CREATE TABLE "ajustes_modulos_en_mantencion" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_ajustes_modulos_en_mantencion",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "ajustes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar DEFAULT 'Ajustes de la plataforma',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ajustes_id" integer;
  ALTER TABLE "ajustes_modulos_en_mantencion" ADD CONSTRAINT "ajustes_modulos_en_mantencion_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ajustes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ajustes_modulos_en_mantencion_order_idx" ON "ajustes_modulos_en_mantencion" USING btree ("order");
  CREATE INDEX "ajustes_modulos_en_mantencion_parent_idx" ON "ajustes_modulos_en_mantencion" USING btree ("parent_id");
  CREATE INDEX "ajustes_updated_at_idx" ON "ajustes" USING btree ("updated_at");
  CREATE INDEX "ajustes_created_at_idx" ON "ajustes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ajustes_fk" FOREIGN KEY ("ajustes_id") REFERENCES "public"."ajustes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ajustes_id_idx" ON "payload_locked_documents_rels" USING btree ("ajustes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ajustes_modulos_en_mantencion" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ajustes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ajustes_modulos_en_mantencion" CASCADE;
  DROP TABLE "ajustes" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ajustes_fk";
  
  DROP INDEX "payload_locked_documents_rels_ajustes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ajustes_id";
  DROP TYPE "public"."enum_ajustes_modulos_en_mantencion";`)
}
