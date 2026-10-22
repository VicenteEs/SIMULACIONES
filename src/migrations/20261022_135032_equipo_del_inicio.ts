import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "equipo" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"cargo" varchar NOT NULL,
  	"descripcion" varchar,
  	"foto_id" integer,
  	"orden" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "equipo_id" integer;
  ALTER TABLE "equipo" ADD CONSTRAINT "equipo_foto_id_medios_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "equipo_foto_idx" ON "equipo" USING btree ("foto_id");
  CREATE INDEX "equipo_updated_at_idx" ON "equipo" USING btree ("updated_at");
  CREATE INDEX "equipo_created_at_idx" ON "equipo" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_equipo_fk" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipo"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_equipo_id_idx" ON "payload_locked_documents_rels" USING btree ("equipo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "equipo" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "equipo" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_equipo_fk";
  
  DROP INDEX "payload_locked_documents_rels_equipo_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "equipo_id";`)
}
