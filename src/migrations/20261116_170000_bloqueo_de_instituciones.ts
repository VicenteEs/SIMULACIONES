import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Lo que la pasada diaria apunta de una institución bloqueada (P-016 E5.8,
// D-403): cuándo avisó que se borrarán sus cuentas y cuándo las borró. Vacías
// en las que ya existen, que es lo correcto: ninguna se avisó todavía, y la
// primera pasada después de desplegar decide con su fecha de término.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "instituciones" ADD COLUMN "aviso_de_borrado_en" timestamp(3) with time zone;
  ALTER TABLE "instituciones" ADD COLUMN "cuentas_borradas_en" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "instituciones" DROP COLUMN "aviso_de_borrado_en";
  ALTER TABLE "instituciones" DROP COLUMN "cuentas_borradas_en";`)
}
