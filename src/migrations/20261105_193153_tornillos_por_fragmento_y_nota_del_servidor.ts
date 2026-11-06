import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// E2 de P-012. Los tornillos por fragmento principal del paso de fijación (D-309) y la comprobación de la nota en
// `actividad` (D-310). Ninguna lleva `DEFAULT`, y por motivos distintos:
// - `tornillos_por_fragmento` vacío es «lo de la AO» y un número es una decisión del editor; un `DEFAULT` no se
//   distinguiría de lo segundo, y `objetivoDelPaso` toma los números de fijación como prueba de intención.
// - `comprobacion_de_la_nota` vacía es un recorrido de antes de que el servidor rehiciera la nota. Rellenarla con
//   «sin comprobar» diría lo mismo con más palabras, y la escribe el siguiente hito de cada residente.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_actividad_comprobacion_de_la_nota" AS ENUM('coincide', 'no-coincide', 'sin-comprobar');
  ALTER TABLE "cirugias_pasos" ADD COLUMN "tornillos_por_fragmento" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "tornillos_por_fragmento" numeric;
  ALTER TABLE "actividad" ADD COLUMN "comprobacion_de_la_nota" "enum_actividad_comprobacion_de_la_nota";
  ALTER TABLE "actividad" ADD COLUMN "nota_del_navegador" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_pasos" DROP COLUMN "tornillos_por_fragmento";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "tornillos_por_fragmento";
  ALTER TABLE "actividad" DROP COLUMN "comprobacion_de_la_nota";
  ALTER TABLE "actividad" DROP COLUMN "nota_del_navegador";
  DROP TYPE "public"."enum_actividad_comprobacion_de_la_nota";`)
}
