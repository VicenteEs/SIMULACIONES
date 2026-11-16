import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Las instituciones (P-016 E5.1, D-396): su tabla y la marca `institucion_id`
// en cada fila que pertenece a una. Todas las filas de antes quedan sin marca,
// que es la central.
//
// El texto libre que se llamaba `institucion` en `usuarios` pasa a
// `procedencia` con un RENAME escrito a mano. `migrate:create` lo habría
// generado como borrar una columna y crear otra, y con eso se perdía lo que
// cada persona escribió al pedir su cuenta. Para no tener que contestar la
// pregunta interactiva de drizzle-kit, se generó en dos pasadas (quitar el
// campo, y después poner los nuevos) y se juntaron aquí; el `.json` es el de
// la segunda.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_instituciones_modalidad" AS ENUM('piloto', 'definitiva');
  CREATE TABLE "instituciones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"subdominio" varchar NOT NULL,
  	"modalidad" "enum_instituciones_modalidad" DEFAULT 'piloto' NOT NULL,
  	"inicio" timestamp(3) with time zone NOT NULL,
  	"vence" timestamp(3) with time zone,
  	"cupo" numeric NOT NULL,
  	"correo_del_administrador" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "usuarios" RENAME COLUMN "institucion" TO "procedencia";
  ALTER TABLE "usuarios" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "medios" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "modelos_3d" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "patologias" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "_patologias_v" ADD COLUMN "version_institucion_id" integer;
  ALTER TABLE "maniobras" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "_maniobras_v" ADD COLUMN "version_institucion_id" integer;
  ALTER TABLE "casos_ao" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "_casos_ao_v" ADD COLUMN "version_institucion_id" integer;
  ALTER TABLE "cirugias" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_institucion_id" integer;
  ALTER TABLE "estudios_ia" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "_estudios_ia_v" ADD COLUMN "version_institucion_id" integer;
  ALTER TABLE "comentarios" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "actividad" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "revisiones" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "sesiones_de_revision" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "registro_de_acciones" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "entradas" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "tiempo_activo" ADD COLUMN "institucion_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "instituciones_id" integer;
  CREATE UNIQUE INDEX "instituciones_subdominio_idx" ON "instituciones" USING btree ("subdominio");
  CREATE INDEX "instituciones_vence_idx" ON "instituciones" USING btree ("vence");
  CREATE INDEX "instituciones_updated_at_idx" ON "instituciones" USING btree ("updated_at");
  CREATE INDEX "instituciones_created_at_idx" ON "instituciones" USING btree ("created_at");
  ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "medios" ADD CONSTRAINT "medios_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "modelos_3d" ADD CONSTRAINT "modelos_3d_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "patologias" ADD CONSTRAINT "patologias_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_patologias_v" ADD CONSTRAINT "_patologias_v_version_institucion_id_instituciones_id_fk" FOREIGN KEY ("version_institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "maniobras" ADD CONSTRAINT "maniobras_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_maniobras_v" ADD CONSTRAINT "_maniobras_v_version_institucion_id_instituciones_id_fk" FOREIGN KEY ("version_institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "casos_ao" ADD CONSTRAINT "casos_ao_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_casos_ao_v" ADD CONSTRAINT "_casos_ao_v_version_institucion_id_instituciones_id_fk" FOREIGN KEY ("version_institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias" ADD CONSTRAINT "cirugias_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v" ADD CONSTRAINT "_cirugias_v_version_institucion_id_instituciones_id_fk" FOREIGN KEY ("version_institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "estudios_ia" ADD CONSTRAINT "estudios_ia_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v" ADD CONSTRAINT "_estudios_ia_v_version_institucion_id_instituciones_id_fk" FOREIGN KEY ("version_institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "actividad" ADD CONSTRAINT "actividad_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sesiones_de_revision" ADD CONSTRAINT "sesiones_de_revision_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "registro_de_acciones" ADD CONSTRAINT "registro_de_acciones_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entradas" ADD CONSTRAINT "entradas_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tiempo_activo" ADD CONSTRAINT "tiempo_activo_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_instituciones_fk" FOREIGN KEY ("instituciones_id") REFERENCES "public"."instituciones"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "usuarios_institucion_idx" ON "usuarios" USING btree ("institucion_id");
  CREATE INDEX "medios_institucion_idx" ON "medios" USING btree ("institucion_id");
  CREATE INDEX "modelos_3d_institucion_idx" ON "modelos_3d" USING btree ("institucion_id");
  CREATE INDEX "patologias_institucion_idx" ON "patologias" USING btree ("institucion_id");
  CREATE INDEX "_patologias_v_version_version_institucion_idx" ON "_patologias_v" USING btree ("version_institucion_id");
  CREATE INDEX "maniobras_institucion_idx" ON "maniobras" USING btree ("institucion_id");
  CREATE INDEX "_maniobras_v_version_version_institucion_idx" ON "_maniobras_v" USING btree ("version_institucion_id");
  CREATE INDEX "casos_ao_institucion_idx" ON "casos_ao" USING btree ("institucion_id");
  CREATE INDEX "_casos_ao_v_version_version_institucion_idx" ON "_casos_ao_v" USING btree ("version_institucion_id");
  CREATE INDEX "cirugias_institucion_idx" ON "cirugias" USING btree ("institucion_id");
  CREATE INDEX "_cirugias_v_version_version_institucion_idx" ON "_cirugias_v" USING btree ("version_institucion_id");
  CREATE INDEX "estudios_ia_institucion_idx" ON "estudios_ia" USING btree ("institucion_id");
  CREATE INDEX "_estudios_ia_v_version_version_institucion_idx" ON "_estudios_ia_v" USING btree ("version_institucion_id");
  CREATE INDEX "comentarios_institucion_idx" ON "comentarios" USING btree ("institucion_id");
  CREATE INDEX "actividad_institucion_idx" ON "actividad" USING btree ("institucion_id");
  CREATE INDEX "revisiones_institucion_idx" ON "revisiones" USING btree ("institucion_id");
  CREATE INDEX "sesiones_de_revision_institucion_idx" ON "sesiones_de_revision" USING btree ("institucion_id");
  CREATE INDEX "registro_de_acciones_institucion_idx" ON "registro_de_acciones" USING btree ("institucion_id");
  CREATE INDEX "entradas_institucion_idx" ON "entradas" USING btree ("institucion_id");
  CREATE INDEX "tiempo_activo_institucion_idx" ON "tiempo_activo" USING btree ("institucion_id");
  CREATE INDEX "payload_locked_documents_rels_instituciones_id_idx" ON "payload_locked_documents_rels" USING btree ("instituciones_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Las restricciones antes que la tabla: «DROP TABLE … CASCADE» ya se las
  -- lleva, y el «DROP CONSTRAINT» que venía después fallaba con «no existe».
  -- Así lo generó «migrate:create»; se reordenó a mano.
  ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "medios" DROP CONSTRAINT "medios_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "modelos_3d" DROP CONSTRAINT "modelos_3d_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "patologias" DROP CONSTRAINT "patologias_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "_patologias_v" DROP CONSTRAINT "_patologias_v_version_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "maniobras" DROP CONSTRAINT "maniobras_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "_maniobras_v" DROP CONSTRAINT "_maniobras_v_version_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "casos_ao" DROP CONSTRAINT "casos_ao_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "_casos_ao_v" DROP CONSTRAINT "_casos_ao_v_version_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "cirugias" DROP CONSTRAINT "cirugias_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "_cirugias_v" DROP CONSTRAINT "_cirugias_v_version_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "estudios_ia" DROP CONSTRAINT "estudios_ia_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "_estudios_ia_v" DROP CONSTRAINT "_estudios_ia_v_version_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "comentarios" DROP CONSTRAINT "comentarios_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "actividad" DROP CONSTRAINT "actividad_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "revisiones" DROP CONSTRAINT "revisiones_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "sesiones_de_revision" DROP CONSTRAINT "sesiones_de_revision_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "registro_de_acciones" DROP CONSTRAINT "registro_de_acciones_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "entradas" DROP CONSTRAINT "entradas_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "tiempo_activo" DROP CONSTRAINT "tiempo_activo_institucion_id_instituciones_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_instituciones_fk";
  
  DROP INDEX "usuarios_institucion_idx";
  DROP INDEX "medios_institucion_idx";
  DROP INDEX "modelos_3d_institucion_idx";
  DROP INDEX "patologias_institucion_idx";
  DROP INDEX "_patologias_v_version_version_institucion_idx";
  DROP INDEX "maniobras_institucion_idx";
  DROP INDEX "_maniobras_v_version_version_institucion_idx";
  DROP INDEX "casos_ao_institucion_idx";
  DROP INDEX "_casos_ao_v_version_version_institucion_idx";
  DROP INDEX "cirugias_institucion_idx";
  DROP INDEX "_cirugias_v_version_version_institucion_idx";
  DROP INDEX "estudios_ia_institucion_idx";
  DROP INDEX "_estudios_ia_v_version_version_institucion_idx";
  DROP INDEX "comentarios_institucion_idx";
  DROP INDEX "actividad_institucion_idx";
  DROP INDEX "revisiones_institucion_idx";
  DROP INDEX "sesiones_de_revision_institucion_idx";
  DROP INDEX "registro_de_acciones_institucion_idx";
  DROP INDEX "entradas_institucion_idx";
  DROP INDEX "tiempo_activo_institucion_idx";
  DROP INDEX "payload_locked_documents_rels_instituciones_id_idx";
  DROP TABLE "instituciones";
  ALTER TABLE "usuarios" RENAME COLUMN "procedencia" TO "institucion";
  ALTER TABLE "usuarios" DROP COLUMN "institucion_id";
  ALTER TABLE "medios" DROP COLUMN "institucion_id";
  ALTER TABLE "modelos_3d" DROP COLUMN "institucion_id";
  ALTER TABLE "patologias" DROP COLUMN "institucion_id";
  ALTER TABLE "_patologias_v" DROP COLUMN "version_institucion_id";
  ALTER TABLE "maniobras" DROP COLUMN "institucion_id";
  ALTER TABLE "_maniobras_v" DROP COLUMN "version_institucion_id";
  ALTER TABLE "casos_ao" DROP COLUMN "institucion_id";
  ALTER TABLE "_casos_ao_v" DROP COLUMN "version_institucion_id";
  ALTER TABLE "cirugias" DROP COLUMN "institucion_id";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_institucion_id";
  ALTER TABLE "estudios_ia" DROP COLUMN "institucion_id";
  ALTER TABLE "_estudios_ia_v" DROP COLUMN "version_institucion_id";
  ALTER TABLE "comentarios" DROP COLUMN "institucion_id";
  ALTER TABLE "actividad" DROP COLUMN "institucion_id";
  ALTER TABLE "revisiones" DROP COLUMN "institucion_id";
  ALTER TABLE "sesiones_de_revision" DROP COLUMN "institucion_id";
  ALTER TABLE "registro_de_acciones" DROP COLUMN "institucion_id";
  ALTER TABLE "entradas" DROP COLUMN "institucion_id";
  ALTER TABLE "tiempo_activo" DROP COLUMN "institucion_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "instituciones_id";
  DROP TYPE "public"."enum_instituciones_modalidad";`)
}
