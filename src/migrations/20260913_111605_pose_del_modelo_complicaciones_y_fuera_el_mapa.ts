import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Las tres decisiones del traumatólogo de hoy, en una sola migración.
 *
 * 1. **El modelo 3D guarda su pose** (`modelos_3d.encuadre_*`). «Enfocar el
 *    punto de vista del alumno, dejarle el modelo de la pierna por ejemplo en
 *    una pose»: el ángulo desde el que se abre deja de decidirlo el visor por
 *    su cuenta y pasa a ser algo que el profesor captura una vez.
 * 2. **El puntaje y las complicaciones sobreviven al recargado**
 *    (`actividad.puntaje`, `actividad.puntaje_maximo` y la tabla
 *    `actividad_complicaciones`). Vivían en estado local de la consola y morían
 *    con la pestaña, que es lo que hacía que pasarse y quedarse corto acabaran
 *    valiendo lo mismo.
 * 3. **El mapa corporal no se va a dibujar** (`segmentos.zona_mapa_*` fuera).
 *
 * Van juntas porque se decidieron juntas y porque Payload aplica cada migración
 * en su transacción: partirlas en tres daría tres despliegues con estados
 * intermedios que nadie quiere —el panel pidiendo un encuadre que la columna
 * todavía no tiene, por ejemplo— sin ganar nada a cambio.
 *
 * Lo que destruye datos, dicho claro: los cuatro `DROP COLUMN` de `segmentos`.
 * Las coordenadas guardadas se pierden y el `down` no las devuelve —repone las
 * columnas vacías—. Se acepta porque no las leía ningún archivo de `src/` fuera
 * de la propia colección y del esquema del panel: no describen nada que se
 * pueda echar de menos. Si alguien quisiera conservarlas, el momento es antes
 * de aplicar esto, con un respaldo (`npm run respaldar`).
 *
 * Lo que NO lleva y es deliberado: ningún `DEFAULT`.
 *
 * - Las cinco columnas del encuadre nacen nulas, y nulo significa «que lo
 *   encuadre el visor», que es exactamente lo que la plataforma hace hoy. Así
 *   los modelos ya subidos siguen abriéndose igual que antes de esto; con un
 *   `DEFAULT 3` en la distancia, todos pasarían de golpe a un encuadre que
 *   nadie capturó y los que vienen en milímetros se verían como un punto.
 * - `puntaje` nulo no es un cero: es «este caso todavía no se ha jugado». Un
 *   `DEFAULT 0` pondría un cero en toda fila de lectura —también en las de las
 *   fichas de texto, que comparten tabla— y el panel contaría partidas que no
 *   existieron.
 *
 * `actividad_complicaciones` cuelga de `actividad` con borrado en cascada, que
 * lo pone Payload: al borrar una fila de actividad se van sus complicaciones,
 * que es lo correcto —son parte de ella, no un historial aparte—.
 *
 * En desarrollo nada de esto se aplica: allí manda el `push` de Drizzle
 * (`payload.config.ts`), que ya ajustó el esquema al vuelo. Esto corre en el
 * servidor y solo ahí.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "actividad_complicaciones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"paso" varchar NOT NULL,
  	"numero" numeric,
  	"titulo" varchar,
  	"resultado" varchar,
  	"detalle" varchar
  );
  
  ALTER TABLE "modelos_3d" ADD COLUMN "encuadre_escala" numeric;
  ALTER TABLE "modelos_3d" ADD COLUMN "encuadre_giro_x" numeric;
  ALTER TABLE "modelos_3d" ADD COLUMN "encuadre_giro_y" numeric;
  ALTER TABLE "modelos_3d" ADD COLUMN "encuadre_giro_z" numeric;
  ALTER TABLE "modelos_3d" ADD COLUMN "encuadre_distancia_camara" numeric;
  ALTER TABLE "actividad" ADD COLUMN "puntaje" numeric;
  ALTER TABLE "actividad" ADD COLUMN "puntaje_maximo" numeric;
  ALTER TABLE "actividad_complicaciones" ADD CONSTRAINT "actividad_complicaciones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."actividad"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "actividad_complicaciones_order_idx" ON "actividad_complicaciones" USING btree ("_order");
  CREATE INDEX "actividad_complicaciones_parent_id_idx" ON "actividad_complicaciones" USING btree ("_parent_id");
  ALTER TABLE "segmentos" DROP COLUMN "zona_mapa_x";
  ALTER TABLE "segmentos" DROP COLUMN "zona_mapa_y";
  ALTER TABLE "segmentos" DROP COLUMN "zona_mapa_ancho";
  ALTER TABLE "segmentos" DROP COLUMN "zona_mapa_alto";`)

  // Queda en el registro del despliegue porque es la parte que destruye datos
  // sin preguntar, y el registro es el único sitio donde va a constar que
  // ocurrió. En la base de desarrollo de hoy las cuatro columnas están vacías;
  // de la del servidor no ha mirado nadie, y por eso se avisa en vez de darlo
  // por sabido.
  payload.logger.info(
    'segmentos: retiradas las cuatro columnas del mapa corporal (zona_mapa_x/y/ancho/alto). El mapa no se va a dibujar; las coordenadas que hubiera no se conservan.',
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "actividad_complicaciones" CASCADE;
  ALTER TABLE "segmentos" ADD COLUMN "zona_mapa_x" numeric;
  ALTER TABLE "segmentos" ADD COLUMN "zona_mapa_y" numeric;
  ALTER TABLE "segmentos" ADD COLUMN "zona_mapa_ancho" numeric;
  ALTER TABLE "segmentos" ADD COLUMN "zona_mapa_alto" numeric;
  ALTER TABLE "modelos_3d" DROP COLUMN "encuadre_escala";
  ALTER TABLE "modelos_3d" DROP COLUMN "encuadre_giro_x";
  ALTER TABLE "modelos_3d" DROP COLUMN "encuadre_giro_y";
  ALTER TABLE "modelos_3d" DROP COLUMN "encuadre_giro_z";
  ALTER TABLE "modelos_3d" DROP COLUMN "encuadre_distancia_camara";
  ALTER TABLE "actividad" DROP COLUMN "puntaje";
  ALTER TABLE "actividad" DROP COLUMN "puntaje_maximo";`)
}
