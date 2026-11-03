import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "usuarios" ADD COLUMN "bienvenida_vista_en" timestamp(3) with time zone;
  ALTER TABLE "actividad" ADD COLUMN "seccion" numeric;`)
  // Las cuentas que ya habían entrado alguna vez conocen la plataforma: sin
  // esto, la próxima vez que entraran las recibiría la bienvenida del primer
  // ingreso, meses después de su primer ingreso (D-237). Se toma su último
  // acceso como fecha porque es la única que dice que la cuenta llegó a entrar;
  // la que nunca entró la verá, que es justo para quien está.
  await db.execute(sql`
   UPDATE "usuarios" SET "bienvenida_vista_en" = "ultimo_acceso" WHERE "ultimo_acceso" IS NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "usuarios" DROP COLUMN "bienvenida_vista_en";
  ALTER TABLE "actividad" DROP COLUMN "seccion";`)
}
