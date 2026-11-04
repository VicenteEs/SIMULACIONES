import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_piezas" ADD COLUMN "posicion_reducida_x" numeric;
  ALTER TABLE "cirugias_piezas" ADD COLUMN "posicion_reducida_y" numeric;
  ALTER TABLE "cirugias_piezas" ADD COLUMN "posicion_reducida_z" numeric;
  ALTER TABLE "cirugias_piezas" ADD COLUMN "posicion_reducida_qx" numeric;
  ALTER TABLE "cirugias_piezas" ADD COLUMN "posicion_reducida_qy" numeric;
  ALTER TABLE "cirugias_piezas" ADD COLUMN "posicion_reducida_qz" numeric;
  ALTER TABLE "cirugias_piezas" ADD COLUMN "posicion_reducida_qw" numeric;
  ALTER TABLE "_cirugias_v_version_piezas" ADD COLUMN "posicion_reducida_x" numeric;
  ALTER TABLE "_cirugias_v_version_piezas" ADD COLUMN "posicion_reducida_y" numeric;
  ALTER TABLE "_cirugias_v_version_piezas" ADD COLUMN "posicion_reducida_z" numeric;
  ALTER TABLE "_cirugias_v_version_piezas" ADD COLUMN "posicion_reducida_qx" numeric;
  ALTER TABLE "_cirugias_v_version_piezas" ADD COLUMN "posicion_reducida_qy" numeric;
  ALTER TABLE "_cirugias_v_version_piezas" ADD COLUMN "posicion_reducida_qz" numeric;
  ALTER TABLE "_cirugias_v_version_piezas" ADD COLUMN "posicion_reducida_qw" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_piezas" DROP COLUMN "posicion_reducida_x";
  ALTER TABLE "cirugias_piezas" DROP COLUMN "posicion_reducida_y";
  ALTER TABLE "cirugias_piezas" DROP COLUMN "posicion_reducida_z";
  ALTER TABLE "cirugias_piezas" DROP COLUMN "posicion_reducida_qx";
  ALTER TABLE "cirugias_piezas" DROP COLUMN "posicion_reducida_qy";
  ALTER TABLE "cirugias_piezas" DROP COLUMN "posicion_reducida_qz";
  ALTER TABLE "cirugias_piezas" DROP COLUMN "posicion_reducida_qw";
  ALTER TABLE "_cirugias_v_version_piezas" DROP COLUMN "posicion_reducida_x";
  ALTER TABLE "_cirugias_v_version_piezas" DROP COLUMN "posicion_reducida_y";
  ALTER TABLE "_cirugias_v_version_piezas" DROP COLUMN "posicion_reducida_z";
  ALTER TABLE "_cirugias_v_version_piezas" DROP COLUMN "posicion_reducida_qx";
  ALTER TABLE "_cirugias_v_version_piezas" DROP COLUMN "posicion_reducida_qy";
  ALTER TABLE "_cirugias_v_version_piezas" DROP COLUMN "posicion_reducida_qz";
  ALTER TABLE "_cirugias_v_version_piezas" DROP COLUMN "posicion_reducida_qw";`)
}
