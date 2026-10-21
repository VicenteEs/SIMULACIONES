import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "instrumental" ADD COLUMN "orificios" numeric;
  ALTER TABLE "instrumental" ADD COLUMN "largo_mm" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "instrumental" DROP COLUMN "orificios";
  ALTER TABLE "instrumental" DROP COLUMN "largo_mm";`)
}
