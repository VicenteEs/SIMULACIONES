import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_usuarios_profesion" AS ENUM('medico', 'kinesiologo');
  ALTER TYPE "public"."enum_revisiones_historial_accion" ADD VALUE 'firmada' BEFORE 'reabierta';
  ALTER TABLE "usuarios" ADD COLUMN "profesion" "enum_usuarios_profesion";
  ALTER TABLE "revisiones" ADD COLUMN "firma_medico_por_id" integer;
  ALTER TABLE "revisiones" ADD COLUMN "firma_medico_en" timestamp(3) with time zone;
  ALTER TABLE "revisiones" ADD COLUMN "firma_kinesiologo_por_id" integer;
  ALTER TABLE "revisiones" ADD COLUMN "firma_kinesiologo_en" timestamp(3) with time zone;
  ALTER TABLE "revisiones" ADD COLUMN "huella_firmada" varchar;
  ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_firma_medico_por_id_usuarios_id_fk" FOREIGN KEY ("firma_medico_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_firma_kinesiologo_por_id_usuarios_id_fk" FOREIGN KEY ("firma_kinesiologo_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "revisiones_firma_medico_por_idx" ON "revisiones" USING btree ("firma_medico_por_id");
  CREATE INDEX "revisiones_firma_kinesiologo_por_idx" ON "revisiones" USING btree ("firma_kinesiologo_por_id");`)
}

// Al deshacer, las filas «firmada» del historial pasan a «lista» antes de volver
// al tipo viejo, que no la tiene: sin eso, el cambio de tipo falla en cuanto
// alguien firmó una ficha, y la migración no se puede deshacer.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "revisiones" DROP CONSTRAINT "revisiones_firma_medico_por_id_usuarios_id_fk";
  
  ALTER TABLE "revisiones" DROP CONSTRAINT "revisiones_firma_kinesiologo_por_id_usuarios_id_fk";
  
  ALTER TABLE "revisiones_historial" ALTER COLUMN "accion" SET DATA TYPE text;
  UPDATE "revisiones_historial" SET "accion" = 'lista' WHERE "accion" = 'firmada';
  DROP TYPE "public"."enum_revisiones_historial_accion";
  CREATE TYPE "public"."enum_revisiones_historial_accion" AS ENUM('registrada', 'asignada', 'lista', 'reabierta', 'devuelta', 'publicada', 'retirada');
  ALTER TABLE "revisiones_historial" ALTER COLUMN "accion" SET DATA TYPE "public"."enum_revisiones_historial_accion" USING "accion"::"public"."enum_revisiones_historial_accion";
  DROP INDEX "revisiones_firma_medico_por_idx";
  DROP INDEX "revisiones_firma_kinesiologo_por_idx";
  ALTER TABLE "usuarios" DROP COLUMN "profesion";
  ALTER TABLE "revisiones" DROP COLUMN "firma_medico_por_id";
  ALTER TABLE "revisiones" DROP COLUMN "firma_medico_en";
  ALTER TABLE "revisiones" DROP COLUMN "firma_kinesiologo_por_id";
  ALTER TABLE "revisiones" DROP COLUMN "firma_kinesiologo_en";
  ALTER TABLE "revisiones" DROP COLUMN "huella_firmada";
  DROP TYPE "public"."enum_usuarios_profesion";`)
}
