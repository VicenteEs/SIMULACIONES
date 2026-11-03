import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cotizaciones_modulos" AS ENUM('patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia');
  CREATE TYPE "public"."enum_cotizaciones_residentes" AS ENUM('1 a 5', '6 a 10', '11 a 20', 'Más de 20');
  CREATE TYPE "public"."enum_cotizaciones_estado" AS ENUM('nueva', 'en-conversacion', 'cerrada');
  CREATE TABLE "cotizaciones_modulos" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_cotizaciones_modulos",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cotizaciones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"correo" varchar NOT NULL,
  	"institucion" varchar NOT NULL,
  	"cargo" varchar,
  	"residentes" "enum_cotizaciones_residentes" NOT NULL,
  	"mensaje" varchar,
  	"estado" "enum_cotizaciones_estado" DEFAULT 'nueva' NOT NULL,
  	"notas" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "cotizaciones_id" integer;
  ALTER TABLE "cotizaciones_modulos" ADD CONSTRAINT "cotizaciones_modulos_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cotizaciones"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "cotizaciones_modulos_order_idx" ON "cotizaciones_modulos" USING btree ("order");
  CREATE INDEX "cotizaciones_modulos_parent_idx" ON "cotizaciones_modulos" USING btree ("parent_id");
  CREATE INDEX "cotizaciones_estado_idx" ON "cotizaciones" USING btree ("estado");
  CREATE INDEX "cotizaciones_updated_at_idx" ON "cotizaciones" USING btree ("updated_at");
  CREATE INDEX "cotizaciones_created_at_idx" ON "cotizaciones" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cotizaciones_fk" FOREIGN KEY ("cotizaciones_id") REFERENCES "public"."cotizaciones"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_cotizaciones_id_idx" ON "payload_locked_documents_rels" USING btree ("cotizaciones_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cotizaciones_modulos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cotizaciones" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cotizaciones_modulos" CASCADE;
  DROP TABLE "cotizaciones" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_cotizaciones_fk";
  
  DROP INDEX "payload_locked_documents_rels_cotizaciones_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "cotizaciones_id";
  DROP TYPE "public"."enum_cotizaciones_modulos";
  DROP TYPE "public"."enum_cotizaciones_residentes";
  DROP TYPE "public"."enum_cotizaciones_estado";`)
}
