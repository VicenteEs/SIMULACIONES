import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// El código del enlace de invitación de cada institución (P-016 E5.7, D-402).
//
// La columna la generó `migrate:create`; el relleno de abajo, no. Las
// instituciones que ya existen nacieron sin código, y sin él su `/registro` no
// deja pedir cuenta a nadie: el gancho que lo pone solo corre al crear una.
// Se rellena aquí, con 24 caracteres al azar de la propia base, y no se espera
// a que su administrador pulse «Cambiar el enlace», que no sabe que lo tiene
// que pulsar.
//
// `md5(random())` no es el azar de `nuevoCodigoDeInvitacion` (15 bytes de
// `randomBytes`), pero son 96 bits de un generador que nadie fuera de la base
// ve, contra un formulario con freno de cinco intentos por hora. Quien quiera
// el código de la aplicación lo tiene a un clic.
//
// Generada a las 11:39 y renombrada a las 16:00 para quedar detrás de
// `20261116_150000_barrera_de_instituciones`, que se escribió a mano con esa
// hora: el orden de los nombres es el orden en que corren.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "instituciones" ADD COLUMN "codigo_de_invitacion" varchar;
   UPDATE "instituciones"
      SET "codigo_de_invitacion" = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 24)
    WHERE "codigo_de_invitacion" IS NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "instituciones" DROP COLUMN "codigo_de_invitacion";`)
}
