import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Las entradas a la plataforma (D-374, D-388, E3 de P-016): una tabla nueva,
 * `entradas`, con el equipo, la IP y el país de cada inicio de sesión y cuándo y
 * por qué se cerró.
 *
 * No toca `usuarios_sessions`: la sesión única por cuenta la impone el gancho de
 * entrada (`hooks/sesionUnica.ts`), no la base. Las cuentas que ya tengan dos
 * sesiones abiertas al desplegar las conservan hasta la siguiente entrada o
 * hasta que caduquen, a lo sumo ocho horas.
 *
 * El `down` borra la tabla con lo anotado en ella.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_entradas_motivo_del_cierre" AS ENUM('salio', 'otra-entrada');
  CREATE TABLE "entradas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"fecha" timestamp(3) with time zone NOT NULL,
  	"usuario_id" integer,
  	"sesion" varchar,
  	"equipo" varchar,
  	"ip" varchar,
  	"pais" varchar,
  	"cerro_otro_equipo" boolean DEFAULT false,
  	"cerrada_en" timestamp(3) with time zone,
  	"motivo_del_cierre" "enum_entradas_motivo_del_cierre",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "entradas_id" integer;
  ALTER TABLE "entradas" ADD CONSTRAINT "entradas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "entradas_fecha_idx" ON "entradas" USING btree ("fecha");
  CREATE INDEX "entradas_usuario_idx" ON "entradas" USING btree ("usuario_id");
  CREATE INDEX "entradas_sesion_idx" ON "entradas" USING btree ("sesion");
  CREATE INDEX "entradas_updated_at_idx" ON "entradas" USING btree ("updated_at");
  CREATE INDEX "entradas_created_at_idx" ON "entradas" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_entradas_fk" FOREIGN KEY ("entradas_id") REFERENCES "public"."entradas"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_entradas_id_idx" ON "payload_locked_documents_rels" USING btree ("entradas_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "entradas" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "entradas" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_entradas_fk";
  
  DROP INDEX "payload_locked_documents_rels_entradas_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "entradas_id";
  DROP TYPE "public"."enum_entradas_motivo_del_cierre";`)
}
