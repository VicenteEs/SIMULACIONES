import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * P-003, E8 (D-179): el listado global de estructuras anatómicas, una ficha por pieza del atlas.
 *
 * Lo generó `payload migrate:create`. A mano está solo el orden del `down`: el generador soltaba las tablas primero
 * y después intentaba quitar la clave foránea de `payload_locked_documents_rels`, que `DROP TABLE … CASCADE` ya se
 * había llevado, y bajar la migración fallaba con «constraint … does not exist». Se probó subiendo y bajando dentro de
 * una transacción con ROLLBACK. El índice único de `atlas_id` es lo que impide dos fichas para una misma pieza.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "estructuras_anatomicas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"atlas_id" varchar NOT NULL,
  	"nombre_original" varchar NOT NULL,
  	"sistema" varchar,
  	"region" varchar,
  	"lado" varchar,
  	"nombre_latino" varchar,
  	"definicion" varchar,
  	"origen" varchar,
  	"insercion" varchar,
  	"inervacion" varchar,
  	"accion" varchar,
  	"irrigacion" varchar,
  	"notas" varchar,
  	"oculta" boolean DEFAULT false,
  	"huerfana" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_estructuras_anatomicas_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_atlas_id" varchar NOT NULL,
  	"version_nombre_original" varchar NOT NULL,
  	"version_sistema" varchar,
  	"version_region" varchar,
  	"version_lado" varchar,
  	"version_nombre_latino" varchar,
  	"version_definicion" varchar,
  	"version_origen" varchar,
  	"version_insercion" varchar,
  	"version_inervacion" varchar,
  	"version_accion" varchar,
  	"version_irrigacion" varchar,
  	"version_notas" varchar,
  	"version_oculta" boolean DEFAULT false,
  	"version_huerfana" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "estructuras_anatomicas_id" integer;
  ALTER TABLE "_estructuras_anatomicas_v" ADD CONSTRAINT "_estructuras_anatomicas_v_parent_id_estructuras_anatomicas_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."estructuras_anatomicas"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "estructuras_anatomicas_atlas_id_idx" ON "estructuras_anatomicas" USING btree ("atlas_id");
  CREATE INDEX "estructuras_anatomicas_nombre_original_idx" ON "estructuras_anatomicas" USING btree ("nombre_original");
  CREATE INDEX "estructuras_anatomicas_sistema_idx" ON "estructuras_anatomicas" USING btree ("sistema");
  CREATE INDEX "estructuras_anatomicas_region_idx" ON "estructuras_anatomicas" USING btree ("region");
  CREATE INDEX "estructuras_anatomicas_oculta_idx" ON "estructuras_anatomicas" USING btree ("oculta");
  CREATE INDEX "estructuras_anatomicas_huerfana_idx" ON "estructuras_anatomicas" USING btree ("huerfana");
  CREATE INDEX "estructuras_anatomicas_updated_at_idx" ON "estructuras_anatomicas" USING btree ("updated_at");
  CREATE INDEX "estructuras_anatomicas_created_at_idx" ON "estructuras_anatomicas" USING btree ("created_at");
  CREATE INDEX "_estructuras_anatomicas_v_parent_idx" ON "_estructuras_anatomicas_v" USING btree ("parent_id");
  CREATE INDEX "_estructuras_anatomicas_v_version_version_atlas_id_idx" ON "_estructuras_anatomicas_v" USING btree ("version_atlas_id");
  CREATE INDEX "_estructuras_anatomicas_v_version_version_nombre_origina_idx" ON "_estructuras_anatomicas_v" USING btree ("version_nombre_original");
  CREATE INDEX "_estructuras_anatomicas_v_version_version_sistema_idx" ON "_estructuras_anatomicas_v" USING btree ("version_sistema");
  CREATE INDEX "_estructuras_anatomicas_v_version_version_region_idx" ON "_estructuras_anatomicas_v" USING btree ("version_region");
  CREATE INDEX "_estructuras_anatomicas_v_version_version_oculta_idx" ON "_estructuras_anatomicas_v" USING btree ("version_oculta");
  CREATE INDEX "_estructuras_anatomicas_v_version_version_huerfana_idx" ON "_estructuras_anatomicas_v" USING btree ("version_huerfana");
  CREATE INDEX "_estructuras_anatomicas_v_version_version_updated_at_idx" ON "_estructuras_anatomicas_v" USING btree ("version_updated_at");
  CREATE INDEX "_estructuras_anatomicas_v_version_version_created_at_idx" ON "_estructuras_anatomicas_v" USING btree ("version_created_at");
  CREATE INDEX "_estructuras_anatomicas_v_created_at_idx" ON "_estructuras_anatomicas_v" USING btree ("created_at");
  CREATE INDEX "_estructuras_anatomicas_v_updated_at_idx" ON "_estructuras_anatomicas_v" USING btree ("updated_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_estructuras_anatomicas_fk" FOREIGN KEY ("estructuras_anatomicas_id") REFERENCES "public"."estructuras_anatomicas"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_estructuras_anatomicas_id_idx" ON "payload_locked_documents_rels" USING btree ("estructuras_anatomicas_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_estructuras_anatomicas_fk";
  DROP INDEX "payload_locked_documents_rels_estructuras_anatomicas_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "estructuras_anatomicas_id";
  ALTER TABLE "estructuras_anatomicas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_estructuras_anatomicas_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "_estructuras_anatomicas_v" CASCADE;
  DROP TABLE "estructuras_anatomicas" CASCADE;`)
}
