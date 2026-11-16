import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Dónde actuó el administrador de TraumaHub cuando entró a una institución
// como soporte (P-016 E5.9, D-404): su nombre y su subdominio, en texto, como
// el nombre y el correo de la cuenta. Vacía en las filas que ya existen, que
// es lo correcto: hasta ahora nadie podía entrar así. La columna no toca la
// barrera: las políticas miran `institucion_id`, y el permiso de
// `traumahub_app` es sobre la tabla entera.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "registro_de_acciones" ADD COLUMN "soporte_en" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "registro_de_acciones" DROP COLUMN "soporte_en";`)
}
