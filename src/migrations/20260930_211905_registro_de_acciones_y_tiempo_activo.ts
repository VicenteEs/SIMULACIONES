import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "registro_de_acciones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"fecha" timestamp(3) with time zone NOT NULL,
  	"usuario_id" integer,
  	"usuario_nombre" varchar,
  	"usuario_correo" varchar,
  	"rol" varchar,
  	"permisos" jsonb,
  	"accion" varchar NOT NULL,
  	"coleccion" varchar,
  	"documento_id" varchar,
  	"titulo" varchar,
  	"detalle" varchar,
  	"cambios" jsonb,
  	"origen" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tiempo_activo" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"usuario_id" integer,
  	"dia" varchar NOT NULL,
  	"segundos" numeric DEFAULT 0,
  	"latidos" numeric DEFAULT 0,
  	"por_hora" jsonb,
  	"ultimo_latido" timestamp(3) with time zone,
  	"ultima_ruta" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "registro_de_acciones_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tiempo_activo_id" integer;
  ALTER TABLE "registro_de_acciones" ADD CONSTRAINT "registro_de_acciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tiempo_activo" ADD CONSTRAINT "tiempo_activo_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "registro_de_acciones_fecha_idx" ON "registro_de_acciones" USING btree ("fecha");
  CREATE INDEX "registro_de_acciones_usuario_idx" ON "registro_de_acciones" USING btree ("usuario_id");
  CREATE INDEX "registro_de_acciones_usuario_correo_idx" ON "registro_de_acciones" USING btree ("usuario_correo");
  CREATE INDEX "registro_de_acciones_rol_idx" ON "registro_de_acciones" USING btree ("rol");
  CREATE INDEX "registro_de_acciones_accion_idx" ON "registro_de_acciones" USING btree ("accion");
  CREATE INDEX "registro_de_acciones_coleccion_idx" ON "registro_de_acciones" USING btree ("coleccion");
  CREATE INDEX "registro_de_acciones_updated_at_idx" ON "registro_de_acciones" USING btree ("updated_at");
  CREATE INDEX "registro_de_acciones_created_at_idx" ON "registro_de_acciones" USING btree ("created_at");
  CREATE INDEX "tiempo_activo_usuario_idx" ON "tiempo_activo" USING btree ("usuario_id");
  CREATE INDEX "tiempo_activo_dia_idx" ON "tiempo_activo" USING btree ("dia");
  CREATE INDEX "tiempo_activo_updated_at_idx" ON "tiempo_activo" USING btree ("updated_at");
  CREATE INDEX "tiempo_activo_created_at_idx" ON "tiempo_activo" USING btree ("created_at");
  CREATE UNIQUE INDEX "usuario_dia_idx" ON "tiempo_activo" USING btree ("usuario_id","dia");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_registro_de_acciones_fk" FOREIGN KEY ("registro_de_acciones_id") REFERENCES "public"."registro_de_acciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tiempo_activo_fk" FOREIGN KEY ("tiempo_activo_id") REFERENCES "public"."tiempo_activo"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_registro_de_acciones_id_idx" ON "payload_locked_documents_rels" USING btree ("registro_de_acciones_id");
  CREATE INDEX "payload_locked_documents_rels_tiempo_activo_id_idx" ON "payload_locked_documents_rels" USING btree ("tiempo_activo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "registro_de_acciones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tiempo_activo" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "registro_de_acciones" CASCADE;
  DROP TABLE "tiempo_activo" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_registro_de_acciones_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tiempo_activo_fk";
  
  DROP INDEX "payload_locked_documents_rels_registro_de_acciones_id_idx";
  DROP INDEX "payload_locked_documents_rels_tiempo_activo_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "registro_de_acciones_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tiempo_activo_id";`)
}
