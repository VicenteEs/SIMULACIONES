import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Solicitudes de cuenta y difusiones (D-119, D-120).
 *
 * Cuatro columnas en `usuarios` para que una persona pueda pedir su cuenta y el
 * administrador la revise: `origen`, `pendiente`, `motivo_de_solicitud` y
 * `solicitada_en`. Las cuentas que ya existen quedan como `origen = 'panel'` y
 * `pendiente = false`, que es lo que son: todas las creó un administrador, y
 * ninguna debe aparecer de golpe como solicitud por revisar.
 *
 * Y la tabla `difusiones`, con la cola de envío de cada correo masivo. Ver
 * `src/collections/Difusiones.ts`.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_usuarios_origen" AS ENUM('panel', 'solicitud');
  CREATE TYPE "public"."enum_difusiones_audiencia" AS ENUM('todas', 'lector', 'editor', 'admin');
  CREATE TYPE "public"."enum_difusiones_estado" AS ENUM('enviando', 'enviada', 'con-fallos', 'detenida');
  CREATE TABLE "difusiones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"asunto" varchar NOT NULL,
  	"mensaje" varchar NOT NULL,
  	"boton_texto" varchar,
  	"boton_enlace" varchar,
  	"audiencia" "enum_difusiones_audiencia" DEFAULT 'todas' NOT NULL,
  	"autor_id" integer,
  	"estado" "enum_difusiones_estado" DEFAULT 'enviando' NOT NULL,
  	"total" numeric DEFAULT 0 NOT NULL,
  	"enviados" numeric DEFAULT 0 NOT NULL,
  	"fallidos" numeric DEFAULT 0 NOT NULL,
  	"pendientes" jsonb,
  	"fallos" jsonb,
  	"terminada_en" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "usuarios" ADD COLUMN "origen" "enum_usuarios_origen" DEFAULT 'panel';
  ALTER TABLE "usuarios" ADD COLUMN "pendiente" boolean DEFAULT false;
  ALTER TABLE "usuarios" ADD COLUMN "motivo_de_solicitud" varchar;
  ALTER TABLE "usuarios" ADD COLUMN "solicitada_en" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "difusiones_id" integer;
  ALTER TABLE "difusiones" ADD CONSTRAINT "difusiones_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "difusiones_autor_idx" ON "difusiones" USING btree ("autor_id");
  CREATE INDEX "difusiones_estado_idx" ON "difusiones" USING btree ("estado");
  CREATE INDEX "difusiones_updated_at_idx" ON "difusiones" USING btree ("updated_at");
  CREATE INDEX "difusiones_created_at_idx" ON "difusiones" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_difusiones_fk" FOREIGN KEY ("difusiones_id") REFERENCES "public"."difusiones"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "usuarios_pendiente_idx" ON "usuarios" USING btree ("pendiente");
  CREATE INDEX "payload_locked_documents_rels_difusiones_id_idx" ON "payload_locked_documents_rels" USING btree ("difusiones_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "difusiones" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "difusiones" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_difusiones_fk";
  
  DROP INDEX "usuarios_pendiente_idx";
  DROP INDEX "payload_locked_documents_rels_difusiones_id_idx";
  ALTER TABLE "usuarios" DROP COLUMN "origen";
  ALTER TABLE "usuarios" DROP COLUMN "pendiente";
  ALTER TABLE "usuarios" DROP COLUMN "motivo_de_solicitud";
  ALTER TABLE "usuarios" DROP COLUMN "solicitada_en";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "difusiones_id";
  DROP TYPE "public"."enum_usuarios_origen";
  DROP TYPE "public"."enum_difusiones_audiencia";
  DROP TYPE "public"."enum_difusiones_estado";`)
}
