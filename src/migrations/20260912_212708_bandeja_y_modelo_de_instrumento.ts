import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "cirugias_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"instrumental_id" integer
  );
  
  CREATE TABLE "_cirugias_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"instrumental_id" integer
  );
  
  ALTER TABLE "instrumental" ADD COLUMN "modelo_id" integer;
  ALTER TABLE "cirugias_rels" ADD CONSTRAINT "cirugias_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_rels" ADD CONSTRAINT "cirugias_rels_instrumental_fk" FOREIGN KEY ("instrumental_id") REFERENCES "public"."instrumental"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_rels" ADD CONSTRAINT "_cirugias_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_rels" ADD CONSTRAINT "_cirugias_v_rels_instrumental_fk" FOREIGN KEY ("instrumental_id") REFERENCES "public"."instrumental"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "cirugias_rels_order_idx" ON "cirugias_rels" USING btree ("order");
  CREATE INDEX "cirugias_rels_parent_idx" ON "cirugias_rels" USING btree ("parent_id");
  CREATE INDEX "cirugias_rels_path_idx" ON "cirugias_rels" USING btree ("path");
  CREATE INDEX "cirugias_rels_instrumental_id_idx" ON "cirugias_rels" USING btree ("instrumental_id");
  CREATE INDEX "_cirugias_v_rels_order_idx" ON "_cirugias_v_rels" USING btree ("order");
  CREATE INDEX "_cirugias_v_rels_parent_idx" ON "_cirugias_v_rels" USING btree ("parent_id");
  CREATE INDEX "_cirugias_v_rels_path_idx" ON "_cirugias_v_rels" USING btree ("path");
  CREATE INDEX "_cirugias_v_rels_instrumental_id_idx" ON "_cirugias_v_rels" USING btree ("instrumental_id");
  ALTER TABLE "instrumental" ADD CONSTRAINT "instrumental_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "instrumental_modelo_idx" ON "instrumental" USING btree ("modelo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_cirugias_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cirugias_rels" CASCADE;
  DROP TABLE "_cirugias_v_rels" CASCADE;
  ALTER TABLE "instrumental" DROP CONSTRAINT "instrumental_modelo_id_modelos_3d_id_fk";
  
  DROP INDEX "instrumental_modelo_idx";
  ALTER TABLE "instrumental" DROP COLUMN "modelo_id";`)
}
