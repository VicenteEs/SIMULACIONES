import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Los roles «vaso» y «nervio» de las piezas de una cirugía (P-012 E6): van con el plano muscular, pero cortarlos o
// perforarlos es una complicación. Solo añade dos valores a los dos enumerados (el de la cirugía y el de sus versiones),
// detrás de «fascia», que es donde Postgres los pone; no toca ninguna fila. Los casos guardados siguen teniendo sus
// arterias como «músculo» hasta que alguien pulse «Rellenar desde el modelo» o las cambie a mano.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_cirugias_piezas_rol" ADD VALUE 'vaso';
  ALTER TYPE "public"."enum_cirugias_piezas_rol" ADD VALUE 'nervio';
  ALTER TYPE "public"."enum__cirugias_v_version_piezas_rol" ADD VALUE 'vaso';
  ALTER TYPE "public"."enum__cirugias_v_version_piezas_rol" ADD VALUE 'nervio';`)
}

// Postgres no sabe quitar un valor de un enumerado: se rehace. Las piezas que ya fueran «vaso» o «nervio» vuelven a ser
// «musculo», que es el papel que tenían antes de que existieran (como con la fascia, `20261024_160000_rol_fascia`): sin
// esas líneas, el cambio de tipo fallaría con una fila que ya no cabe.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "cirugias_piezas" SET "rol" = 'musculo' WHERE "rol" IN ('vaso', 'nervio');
  UPDATE "_cirugias_v_version_piezas" SET "rol" = 'musculo' WHERE "rol" IN ('vaso', 'nervio');
  ALTER TABLE "cirugias_piezas" ALTER COLUMN "rol" SET DATA TYPE text;
  ALTER TABLE "cirugias_piezas" ALTER COLUMN "rol" SET DEFAULT 'hueso'::text;
  DROP TYPE "public"."enum_cirugias_piezas_rol";
  CREATE TYPE "public"."enum_cirugias_piezas_rol" AS ENUM('piel', 'musculo', 'hueso', 'fragmento', 'implante', 'fascia');
  ALTER TABLE "cirugias_piezas" ALTER COLUMN "rol" SET DEFAULT 'hueso'::"public"."enum_cirugias_piezas_rol";
  ALTER TABLE "cirugias_piezas" ALTER COLUMN "rol" SET DATA TYPE "public"."enum_cirugias_piezas_rol" USING "rol"::"public"."enum_cirugias_piezas_rol";
  ALTER TABLE "_cirugias_v_version_piezas" ALTER COLUMN "rol" SET DATA TYPE text;
  ALTER TABLE "_cirugias_v_version_piezas" ALTER COLUMN "rol" SET DEFAULT 'hueso'::text;
  DROP TYPE "public"."enum__cirugias_v_version_piezas_rol";
  CREATE TYPE "public"."enum__cirugias_v_version_piezas_rol" AS ENUM('piel', 'musculo', 'hueso', 'fragmento', 'implante', 'fascia');
  ALTER TABLE "_cirugias_v_version_piezas" ALTER COLUMN "rol" SET DEFAULT 'hueso'::"public"."enum__cirugias_v_version_piezas_rol";
  ALTER TABLE "_cirugias_v_version_piezas" ALTER COLUMN "rol" SET DATA TYPE "public"."enum__cirugias_v_version_piezas_rol" USING "rol"::"public"."enum__cirugias_v_version_piezas_rol";`)
}
