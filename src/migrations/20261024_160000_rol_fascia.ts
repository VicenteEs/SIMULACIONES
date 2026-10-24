import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// El rol «fascia» de las piezas de una cirugía (P-006, E3): la capa que va entre la piel y el músculo.
// Solo añade un valor a los dos enumerados (el de la cirugía y el de sus versiones); no toca ninguna fila.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_cirugias_piezas_rol" ADD VALUE 'fascia';
  ALTER TYPE "public"."enum__cirugias_v_version_piezas_rol" ADD VALUE 'fascia';`)
}

// Postgres no sabe quitar un valor de un enumerado: se rehace. Las piezas que ya fueran «fascia» vuelven a
// ser «musculo», que es el papel que tenían antes de que existiera (la consola las cortaba con los planos
// profundos): sin esa línea, el cambio de tipo fallaría con una fila que ya no cabe.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "cirugias_piezas" SET "rol" = 'musculo' WHERE "rol" = 'fascia';
  UPDATE "_cirugias_v_version_piezas" SET "rol" = 'musculo' WHERE "rol" = 'fascia';
  ALTER TABLE "cirugias_piezas" ALTER COLUMN "rol" SET DATA TYPE text;
  ALTER TABLE "cirugias_piezas" ALTER COLUMN "rol" SET DEFAULT 'hueso'::text;
  DROP TYPE "public"."enum_cirugias_piezas_rol";
  CREATE TYPE "public"."enum_cirugias_piezas_rol" AS ENUM('piel', 'musculo', 'hueso', 'fragmento', 'implante');
  ALTER TABLE "cirugias_piezas" ALTER COLUMN "rol" SET DEFAULT 'hueso'::"public"."enum_cirugias_piezas_rol";
  ALTER TABLE "cirugias_piezas" ALTER COLUMN "rol" SET DATA TYPE "public"."enum_cirugias_piezas_rol" USING "rol"::"public"."enum_cirugias_piezas_rol";
  ALTER TABLE "_cirugias_v_version_piezas" ALTER COLUMN "rol" SET DATA TYPE text;
  ALTER TABLE "_cirugias_v_version_piezas" ALTER COLUMN "rol" SET DEFAULT 'hueso'::text;
  DROP TYPE "public"."enum__cirugias_v_version_piezas_rol";
  CREATE TYPE "public"."enum__cirugias_v_version_piezas_rol" AS ENUM('piel', 'musculo', 'hueso', 'fragmento', 'implante');
  ALTER TABLE "_cirugias_v_version_piezas" ALTER COLUMN "rol" SET DEFAULT 'hueso'::"public"."enum__cirugias_v_version_piezas_rol";
  ALTER TABLE "_cirugias_v_version_piezas" ALTER COLUMN "rol" SET DATA TYPE "public"."enum__cirugias_v_version_piezas_rol" USING "rol"::"public"."enum__cirugias_v_version_piezas_rol";`)
}
