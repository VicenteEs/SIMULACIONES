import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cirugias_pano_color" AS ENUM('azul', 'celeste', 'verde');
  CREATE TYPE "public"."enum__cirugias_v_version_pano_color" AS ENUM('azul', 'celeste', 'verde');
  CREATE TYPE "public"."enum_ajustes_tema" AS ENUM('clara', 'oscura-fria', 'verde-quirofano', 'original');
  ALTER TABLE "cirugias" ADD COLUMN "pano_apagado" boolean DEFAULT false;
  ALTER TABLE "cirugias" ADD COLUMN "pano_color" "enum_cirugias_pano_color" DEFAULT 'azul';
  ALTER TABLE "cirugias" ADD COLUMN "pano_zona_x_min" numeric;
  ALTER TABLE "cirugias" ADD COLUMN "pano_zona_x_max" numeric;
  ALTER TABLE "cirugias" ADD COLUMN "pano_zona_y_min" numeric;
  ALTER TABLE "cirugias" ADD COLUMN "pano_zona_y_max" numeric;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_pano_apagado" boolean DEFAULT false;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_pano_color" "enum__cirugias_v_version_pano_color" DEFAULT 'azul';
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_pano_zona_x_min" numeric;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_pano_zona_x_max" numeric;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_pano_zona_y_min" numeric;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_pano_zona_y_max" numeric;
  ALTER TABLE "ajustes" ADD COLUMN "tema" "enum_ajustes_tema" DEFAULT 'oscura-fria';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias" DROP COLUMN "pano_apagado";
  ALTER TABLE "cirugias" DROP COLUMN "pano_color";
  ALTER TABLE "cirugias" DROP COLUMN "pano_zona_x_min";
  ALTER TABLE "cirugias" DROP COLUMN "pano_zona_x_max";
  ALTER TABLE "cirugias" DROP COLUMN "pano_zona_y_min";
  ALTER TABLE "cirugias" DROP COLUMN "pano_zona_y_max";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_pano_apagado";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_pano_color";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_pano_zona_x_min";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_pano_zona_x_max";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_pano_zona_y_min";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_pano_zona_y_max";
  ALTER TABLE "ajustes" DROP COLUMN "tema";
  DROP TYPE "public"."enum_cirugias_pano_color";
  DROP TYPE "public"."enum__cirugias_v_version_pano_color";
  DROP TYPE "public"."enum_ajustes_tema";`)
}
