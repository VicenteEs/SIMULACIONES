import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Lo que comparten los procesos de la aplicación (D-393, E4 de P-016): tres
 * tablas que no son colecciones (`src/lib/tablasInternas.ts`) y dos columnas
 * de `difusiones`.
 *
 * - `intentos`: el freno de las acciones que cualquiera puede llamar
 *   (`ritmo.ts`), con la huella de la clave y no la clave.
 * - `presencias`: quién tiene abierta qué ficha en el editor (`presencia.ts`).
 * - `publicaciones`: la última publicación de cada módulo, que lee el flujo de
 *   `/api/cambios` (`publicaciones.ts`).
 * - `difusiones.trabajador` y `latido_del_trabajador`: quién la está mandando y
 *   cuándo dio señales, para saber desde cualquier proceso si sigue en curso.
 *
 * Las tres tablas nacen vacías y así está bien: lo que guardaban antes vivía en
 * la memoria del proceso y se perdía con cada despliegue. Una difusión que
 * estuviera «enviando» al desplegar queda sin latido, es decir, interrumpida,
 * que es como la dejaba ya cualquier reinicio. El `down` borra las tablas y las
 * columnas con lo que tengan.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "intentos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"freno" varchar NOT NULL,
  	"clave" varchar NOT NULL,
  	"instante" timestamp (3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "presencias" (
  	"ficha" varchar NOT NULL,
  	"usuario" integer NOT NULL,
  	"pestana" varchar NOT NULL,
  	"visible" boolean NOT NULL,
  	"desde" timestamp (3) with time zone NOT NULL,
  	"visto" timestamp (3) with time zone NOT NULL,
  	CONSTRAINT "presencias_ficha_usuario_pestana_pk" PRIMARY KEY("ficha","usuario","pestana")
  );
  
  CREATE TABLE "publicaciones" (
  	"modulo" varchar PRIMARY KEY NOT NULL,
  	"version" bigint NOT NULL,
  	"titulo" varchar NOT NULL
  );
  
  ALTER TABLE "difusiones" ADD COLUMN "trabajador" varchar;
  ALTER TABLE "difusiones" ADD COLUMN "latido_del_trabajador" timestamp(3) with time zone;
  CREATE INDEX "intentos_freno_clave_instante_idx" ON "intentos" USING btree ("freno","clave","instante");
  CREATE INDEX "intentos_instante_idx" ON "intentos" USING btree ("instante");
  CREATE INDEX "presencias_visto_idx" ON "presencias" USING btree ("visto");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "intentos" CASCADE;
  DROP TABLE "presencias" CASCADE;
  DROP TABLE "publicaciones" CASCADE;
  ALTER TABLE "difusiones" DROP COLUMN "trabajador";
  ALTER TABLE "difusiones" DROP COLUMN "latido_del_trabajador";`)
}
