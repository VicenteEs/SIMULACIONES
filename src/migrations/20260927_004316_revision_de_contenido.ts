import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * La revisión del contenido que llega hecho (D-142).
 *
 * Dos tablas nuevas y ninguna columna tocada en las de siempre: `revisiones`,
 * una fila por ficha en revisión con su versión original, su estado y la foto
 * del momento en que alguien la validó (con su historial en
 * `revisiones_historial`), y `sesiones_de_revision`, el tiempo que cada
 * revisor pasa con cada ficha. Las fichas que ya existen no entran en revisión
 * por esto: no tienen fila y se publican como siempre.
 *
 * `sesiones_de_revision.usuario_id` admite nulos a propósito: al borrar una
 * cuenta la clave foránea lo deja a nulo y el tiempo sigue contando para la
 * ficha (ver `src/collections/SesionesDeRevision.ts`).
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_revisiones_historial_accion" AS ENUM('registrada', 'asignada', 'lista', 'reabierta', 'devuelta', 'publicada', 'retirada');
  CREATE TYPE "public"."enum_revisiones_coleccion" AS ENUM('patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia');
  CREATE TYPE "public"."enum_revisiones_origen" AS ENUM('ia', 'manual');
  CREATE TYPE "public"."enum_revisiones_estado" AS ENUM('pendiente', 'en-revision', 'lista', 'devuelta', 'publicada');
  CREATE TYPE "public"."enum_sesiones_de_revision_coleccion" AS ENUM('patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia');
  CREATE TABLE "revisiones_historial" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"accion" "enum_revisiones_historial_accion" NOT NULL,
  	"usuario_id" integer,
  	"fecha" timestamp(3) with time zone NOT NULL,
  	"detalle" varchar,
  	"porcentaje" numeric,
  	"segundos_activos" numeric
  );
  
  CREATE TABLE "revisiones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"coleccion" "enum_revisiones_coleccion" NOT NULL,
  	"documento_id" varchar NOT NULL,
  	"titulo" varchar,
  	"origen" "enum_revisiones_origen" DEFAULT 'ia' NOT NULL,
  	"libro" varchar,
  	"capitulo" varchar,
  	"paginas" varchar,
  	"lote" varchar,
  	"modelo" varchar,
  	"estado" "enum_revisiones_estado" DEFAULT 'pendiente' NOT NULL,
  	"asignada_a_id" integer,
  	"original" jsonb,
  	"palabras_originales" numeric DEFAULT 0,
  	"palabras_actuales" numeric DEFAULT 0,
  	"palabras_quitadas" numeric DEFAULT 0,
  	"palabras_nuevas" numeric DEFAULT 0,
  	"porcentaje_editado" numeric DEFAULT 0,
  	"por_seccion" jsonb,
  	"ultima_edicion" timestamp(3) with time zone,
  	"ultimo_editor_id" integer,
  	"lista_por_id" integer,
  	"lista_en" timestamp(3) with time zone,
  	"segundos_activos_al_validar" numeric,
  	"segundos_abiertos_al_validar" numeric,
  	"porcentaje_al_validar" numeric,
  	"ritmo_al_validar" numeric,
  	"secciones_vistas_al_validar" numeric,
  	"secciones_con_contenido" numeric,
  	"validacion_rapida" boolean DEFAULT false,
  	"motivos_de_alerta" varchar,
  	"nota_de_revision" varchar,
  	"motivo_de_devolucion" varchar,
  	"devoluciones" numeric DEFAULT 0,
  	"publicada_en" timestamp(3) with time zone,
  	"publicada_por_id" integer,
  	"publicada_sin_validar" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sesiones_de_revision" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"usuario_id" integer,
  	"coleccion" "enum_sesiones_de_revision_coleccion" NOT NULL,
  	"documento_id" varchar NOT NULL,
  	"sesion" varchar NOT NULL,
  	"inicio" timestamp(3) with time zone,
  	"ultimo_latido" timestamp(3) with time zone,
  	"segundos_abiertos" numeric DEFAULT 0,
  	"segundos_activos" numeric DEFAULT 0,
  	"por_seccion" jsonb,
  	"ediciones" numeric DEFAULT 0,
  	"guardados" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "revisiones_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sesiones_de_revision_id" integer;
  ALTER TABLE "revisiones_historial" ADD CONSTRAINT "revisiones_historial_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "revisiones_historial" ADD CONSTRAINT "revisiones_historial_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."revisiones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_asignada_a_id_usuarios_id_fk" FOREIGN KEY ("asignada_a_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_ultimo_editor_id_usuarios_id_fk" FOREIGN KEY ("ultimo_editor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_lista_por_id_usuarios_id_fk" FOREIGN KEY ("lista_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_publicada_por_id_usuarios_id_fk" FOREIGN KEY ("publicada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sesiones_de_revision" ADD CONSTRAINT "sesiones_de_revision_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "revisiones_historial_order_idx" ON "revisiones_historial" USING btree ("_order");
  CREATE INDEX "revisiones_historial_parent_id_idx" ON "revisiones_historial" USING btree ("_parent_id");
  CREATE INDEX "revisiones_historial_usuario_idx" ON "revisiones_historial" USING btree ("usuario_id");
  CREATE INDEX "revisiones_coleccion_idx" ON "revisiones" USING btree ("coleccion");
  CREATE INDEX "revisiones_documento_id_idx" ON "revisiones" USING btree ("documento_id");
  CREATE INDEX "revisiones_lote_idx" ON "revisiones" USING btree ("lote");
  CREATE INDEX "revisiones_estado_idx" ON "revisiones" USING btree ("estado");
  CREATE INDEX "revisiones_asignada_a_idx" ON "revisiones" USING btree ("asignada_a_id");
  CREATE INDEX "revisiones_ultimo_editor_idx" ON "revisiones" USING btree ("ultimo_editor_id");
  CREATE INDEX "revisiones_lista_por_idx" ON "revisiones" USING btree ("lista_por_id");
  CREATE INDEX "revisiones_lista_en_idx" ON "revisiones" USING btree ("lista_en");
  CREATE INDEX "revisiones_validacion_rapida_idx" ON "revisiones" USING btree ("validacion_rapida");
  CREATE INDEX "revisiones_publicada_por_idx" ON "revisiones" USING btree ("publicada_por_id");
  CREATE INDEX "revisiones_updated_at_idx" ON "revisiones" USING btree ("updated_at");
  CREATE INDEX "revisiones_created_at_idx" ON "revisiones" USING btree ("created_at");
  CREATE UNIQUE INDEX "coleccion_documentoId_idx" ON "revisiones" USING btree ("coleccion","documento_id");
  CREATE INDEX "sesiones_de_revision_usuario_idx" ON "sesiones_de_revision" USING btree ("usuario_id");
  CREATE INDEX "sesiones_de_revision_coleccion_idx" ON "sesiones_de_revision" USING btree ("coleccion");
  CREATE INDEX "sesiones_de_revision_documento_id_idx" ON "sesiones_de_revision" USING btree ("documento_id");
  CREATE UNIQUE INDEX "sesiones_de_revision_sesion_idx" ON "sesiones_de_revision" USING btree ("sesion");
  CREATE INDEX "sesiones_de_revision_ultimo_latido_idx" ON "sesiones_de_revision" USING btree ("ultimo_latido");
  CREATE INDEX "sesiones_de_revision_updated_at_idx" ON "sesiones_de_revision" USING btree ("updated_at");
  CREATE INDEX "sesiones_de_revision_created_at_idx" ON "sesiones_de_revision" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_revisiones_fk" FOREIGN KEY ("revisiones_id") REFERENCES "public"."revisiones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sesiones_de_revision_fk" FOREIGN KEY ("sesiones_de_revision_id") REFERENCES "public"."sesiones_de_revision"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_revisiones_id_idx" ON "payload_locked_documents_rels" USING btree ("revisiones_id");
  CREATE INDEX "payload_locked_documents_rels_sesiones_de_revision_id_idx" ON "payload_locked_documents_rels" USING btree ("sesiones_de_revision_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "revisiones_historial" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "revisiones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sesiones_de_revision" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "revisiones_historial" CASCADE;
  DROP TABLE "revisiones" CASCADE;
  DROP TABLE "sesiones_de_revision" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_revisiones_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sesiones_de_revision_fk";
  
  DROP INDEX "payload_locked_documents_rels_revisiones_id_idx";
  DROP INDEX "payload_locked_documents_rels_sesiones_de_revision_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "revisiones_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sesiones_de_revision_id";
  DROP TYPE "public"."enum_revisiones_historial_accion";
  DROP TYPE "public"."enum_revisiones_coleccion";
  DROP TYPE "public"."enum_revisiones_origen";
  DROP TYPE "public"."enum_revisiones_estado";
  DROP TYPE "public"."enum_sesiones_de_revision_coleccion";`)
}
