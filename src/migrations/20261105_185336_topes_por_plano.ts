import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Los topes por plano del paso de reducción y la técnica que los pone (D-305, E1 de P-012). Sin `DEFAULT` a propósito,
// al revés que las tres tolerancias de la migración inicial: una fila de antes queda con las cinco columnas en `NULL` y
// se mide como se medía, con el giro entero contra `tolerancia_angulacion`. Así ningún caso ya publicado cambia de nota
// sin que alguien elija la técnica, y un valor en estas columnas prueba que alguien la eligió.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cirugias_pasos_tecnica_de_reduccion" AS ENUM('alineacion', 'anatomica');
  CREATE TYPE "public"."enum__cirugias_v_version_pasos_tecnica_de_reduccion" AS ENUM('alineacion', 'anatomica');
  ALTER TABLE "cirugias_pasos" ADD COLUMN "tecnica_de_reduccion" "enum_cirugias_pasos_tecnica_de_reduccion";
  ALTER TABLE "cirugias_pasos" ADD COLUMN "tolerancia_coronal" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "tolerancia_sagital" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "tolerancia_rotacion" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "tolerancia_acortamiento" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "tecnica_de_reduccion" "enum__cirugias_v_version_pasos_tecnica_de_reduccion";
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "tolerancia_coronal" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "tolerancia_sagital" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "tolerancia_rotacion" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "tolerancia_acortamiento" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_pasos" DROP COLUMN "tecnica_de_reduccion";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "tolerancia_coronal";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "tolerancia_sagital";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "tolerancia_rotacion";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "tolerancia_acortamiento";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "tecnica_de_reduccion";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "tolerancia_coronal";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "tolerancia_sagital";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "tolerancia_rotacion";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "tolerancia_acortamiento";
  DROP TYPE "public"."enum_cirugias_pasos_tecnica_de_reduccion";
  DROP TYPE "public"."enum__cirugias_v_version_pasos_tecnica_de_reduccion";`)
}
