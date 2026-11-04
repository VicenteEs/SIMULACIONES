import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cirugias_pasos_posicion" AS ENUM('de-pie', 'supino', 'prono');
  CREATE TYPE "public"."enum_cirugias_modo" AS ENUM('eleccion', 'practica', 'evaluacion');
  CREATE TYPE "public"."enum__cirugias_v_version_pasos_posicion" AS ENUM('de-pie', 'supino', 'prono');
  CREATE TYPE "public"."enum__cirugias_v_version_modo" AS ENUM('eleccion', 'practica', 'evaluacion');
  CREATE TYPE "public"."enum_actividad_modo_del_recorrido" AS ENUM('practica', 'evaluacion');
  ALTER TABLE "usuarios" ADD COLUMN "privacidad_aceptada_en" timestamp(3) with time zone;
  ALTER TABLE "usuarios" ADD COLUMN "version_del_aviso_de_privacidad" varchar;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "posicion" "enum_cirugias_pasos_posicion";
  ALTER TABLE "cirugias_pasos" ADD COLUMN "encuadre_dx" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "encuadre_dy" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "encuadre_dz" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "encuadre_ax" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "encuadre_ay" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "encuadre_az" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "encuadre_cx" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "encuadre_cy" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "encuadre_cz" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "encuadre_distancia" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "demostracion_id" integer;
  ALTER TABLE "cirugias" ADD COLUMN "modo" "enum_cirugias_modo" DEFAULT 'eleccion';
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "posicion" "enum__cirugias_v_version_pasos_posicion";
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "encuadre_dx" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "encuadre_dy" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "encuadre_dz" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "encuadre_ax" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "encuadre_ay" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "encuadre_az" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "encuadre_cx" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "encuadre_cy" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "encuadre_cz" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "encuadre_distancia" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "demostracion_id" integer;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_modo" "enum__cirugias_v_version_modo" DEFAULT 'eleccion';
  ALTER TABLE "actividad" ADD COLUMN "modo_del_recorrido" "enum_actividad_modo_del_recorrido";
  ALTER TABLE "actividad" ADD COLUMN "avance" jsonb;
  ALTER TABLE "cirugias_pasos" ADD CONSTRAINT "cirugias_pasos_demostracion_id_medios_id_fk" FOREIGN KEY ("demostracion_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v_version_pasos" ADD CONSTRAINT "_cirugias_v_version_pasos_demostracion_id_medios_id_fk" FOREIGN KEY ("demostracion_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "cirugias_pasos_demostracion_idx" ON "cirugias_pasos" USING btree ("demostracion_id");
  CREATE INDEX "_cirugias_v_version_pasos_demostracion_idx" ON "_cirugias_v_version_pasos" USING btree ("demostracion_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_pasos" DROP CONSTRAINT "cirugias_pasos_demostracion_id_medios_id_fk";
  
  ALTER TABLE "_cirugias_v_version_pasos" DROP CONSTRAINT "_cirugias_v_version_pasos_demostracion_id_medios_id_fk";
  
  DROP INDEX "cirugias_pasos_demostracion_idx";
  DROP INDEX "_cirugias_v_version_pasos_demostracion_idx";
  ALTER TABLE "usuarios" DROP COLUMN "privacidad_aceptada_en";
  ALTER TABLE "usuarios" DROP COLUMN "version_del_aviso_de_privacidad";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "posicion";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "encuadre_dx";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "encuadre_dy";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "encuadre_dz";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "encuadre_ax";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "encuadre_ay";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "encuadre_az";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "encuadre_cx";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "encuadre_cy";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "encuadre_cz";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "encuadre_distancia";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "demostracion_id";
  ALTER TABLE "cirugias" DROP COLUMN "modo";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "posicion";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "encuadre_dx";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "encuadre_dy";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "encuadre_dz";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "encuadre_ax";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "encuadre_ay";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "encuadre_az";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "encuadre_cx";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "encuadre_cy";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "encuadre_cz";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "encuadre_distancia";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "demostracion_id";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_modo";
  ALTER TABLE "actividad" DROP COLUMN "modo_del_recorrido";
  ALTER TABLE "actividad" DROP COLUMN "avance";
  DROP TYPE "public"."enum_cirugias_pasos_posicion";
  DROP TYPE "public"."enum_cirugias_modo";
  DROP TYPE "public"."enum__cirugias_v_version_pasos_posicion";
  DROP TYPE "public"."enum__cirugias_v_version_modo";
  DROP TYPE "public"."enum_actividad_modo_del_recorrido";`)
}
