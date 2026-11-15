import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * De qué preparación del atlas salió cada modelo (D-372, E3 de P-016).
 *
 * Una columna nueva, `preparacion_id`, que queda a nulo si la preparación se
 * borra. Con ella, `eliminarInstancia` borra los modelos que la preparación
 * exportó y nadie usa.
 *
 * Los modelos que ya existen se enlazan por su nombre, que `exportarPreparacion`
 * escribe siempre como «<preparación> · del atlas», y solo cuando ese nombre es
 * de una preparación y nada más: con dos preparaciones del mismo nombre no se
 * adivina de cuál salió, igual que en `reexportarConEstructurasSeparadas`, y el
 * modelo se queda sin enlazar, como uno subido a mano. Los de preparaciones ya
 * borradas no tienen con qué enlazarse; esos se limpian a mano (D-372).
 *
 * El `down` quita la columna y lo enlazado con ella.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "modelos_3d" ADD COLUMN "preparacion_id" integer;
  ALTER TABLE "modelos_3d" ADD CONSTRAINT "modelos_3d_preparacion_id_instancias_atlas_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."instancias_atlas"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "modelos_3d_preparacion_idx" ON "modelos_3d" USING btree ("preparacion_id");`)

  await db.execute(sql`
    UPDATE "modelos_3d" m
       SET "preparacion_id" = i."id"
      FROM "instancias_atlas" i
     WHERE m."nombre" = i."nombre" || ' · del atlas'
       AND (SELECT count(*) FROM "instancias_atlas" j WHERE j."nombre" = i."nombre") = 1`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "modelos_3d" DROP CONSTRAINT "modelos_3d_preparacion_id_instancias_atlas_id_fk";
  
  DROP INDEX "modelos_3d_preparacion_idx";
  ALTER TABLE "modelos_3d" DROP COLUMN "preparacion_id";`)
}
