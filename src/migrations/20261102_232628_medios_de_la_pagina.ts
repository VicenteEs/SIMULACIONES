import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "medios_pagina" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"espacio" varchar NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "textos_pagina" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"espacio" varchar NOT NULL,
  	"texto" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "medios_pagina_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "textos_pagina_id" integer;
  CREATE INDEX "medios_pagina_espacio_idx" ON "medios_pagina" USING btree ("espacio");
  CREATE INDEX "medios_pagina_updated_at_idx" ON "medios_pagina" USING btree ("updated_at");
  CREATE INDEX "medios_pagina_created_at_idx" ON "medios_pagina" USING btree ("created_at");
  CREATE UNIQUE INDEX "medios_pagina_filename_idx" ON "medios_pagina" USING btree ("filename");
  CREATE INDEX "textos_pagina_espacio_idx" ON "textos_pagina" USING btree ("espacio");
  CREATE INDEX "textos_pagina_updated_at_idx" ON "textos_pagina" USING btree ("updated_at");
  CREATE INDEX "textos_pagina_created_at_idx" ON "textos_pagina" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_medios_pagina_fk" FOREIGN KEY ("medios_pagina_id") REFERENCES "public"."medios_pagina"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_textos_pagina_fk" FOREIGN KEY ("textos_pagina_id") REFERENCES "public"."textos_pagina"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_medios_pagina_id_idx" ON "payload_locked_documents_rels" USING btree ("medios_pagina_id");
  CREATE INDEX "payload_locked_documents_rels_textos_pagina_id_idx" ON "payload_locked_documents_rels" USING btree ("textos_pagina_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "medios_pagina" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "textos_pagina" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "medios_pagina" CASCADE;
  DROP TABLE "textos_pagina" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_medios_pagina_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_textos_pagina_fk";
  
  DROP INDEX "payload_locked_documents_rels_medios_pagina_id_idx";
  DROP INDEX "payload_locked_documents_rels_textos_pagina_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "medios_pagina_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "textos_pagina_id";`)
}
