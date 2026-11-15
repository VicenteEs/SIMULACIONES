import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Las resoluciones de referencia de los casos del simulador (D-373, E3 de P-016).
 *
 * Una tabla nueva y vacía, sin datos que convertir: las referencias las graba
 * el editor desde la consola, caso por caso. La relación con el caso es única
 * —una referencia por caso— y queda a nulo si el caso se borra, aunque el
 * gancho `borrarSuResolucionDeReferencia` borra antes la fila entera.
 *
 * La columna en `payload_locked_documents_rels` la pone Payload para toda
 * colección; no se usa, porque el panel propio no bloquea documentos.
 *
 * El `down` tira la tabla con lo grabado: volver atrás pierde las referencias,
 * que habría que volver a grabar.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "resoluciones_de_referencia" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"cirugia_id" integer,
  	"recorrido" jsonb NOT NULL,
  	"puntaje" numeric NOT NULL,
  	"puntaje_maximo" numeric NOT NULL,
  	"version_del_formato" numeric,
  	"caso_guardado_en" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "resoluciones_de_referencia_id" integer;
  ALTER TABLE "resoluciones_de_referencia" ADD CONSTRAINT "resoluciones_de_referencia_cirugia_id_cirugias_id_fk" FOREIGN KEY ("cirugia_id") REFERENCES "public"."cirugias"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "resoluciones_de_referencia_cirugia_idx" ON "resoluciones_de_referencia" USING btree ("cirugia_id");
  CREATE INDEX "resoluciones_de_referencia_updated_at_idx" ON "resoluciones_de_referencia" USING btree ("updated_at");
  CREATE INDEX "resoluciones_de_referencia_created_at_idx" ON "resoluciones_de_referencia" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_resoluciones_de_referencia_fk" FOREIGN KEY ("resoluciones_de_referencia_id") REFERENCES "public"."resoluciones_de_referencia"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_resoluciones_de_referencia_idx" ON "payload_locked_documents_rels" USING btree ("resoluciones_de_referencia_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "resoluciones_de_referencia" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "resoluciones_de_referencia" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_resoluciones_de_referencia_fk";
  
  DROP INDEX "payload_locked_documents_rels_resoluciones_de_referencia_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "resoluciones_de_referencia_id";`)
}
