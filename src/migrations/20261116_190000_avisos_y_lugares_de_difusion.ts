import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Los lugares y los canales de una difusión, y el aviso dentro de la
 * plataforma (P-016 E6, D-375, D-406).
 *
 * - `difusiones` gana a qué lugares va (`lugares`, vacío es todos), si sale por
 *   correo, si sale como aviso y hasta cuándo se ve. Las que ya había reciben
 *   los valores por omisión, que son los de lo que fueron: solo un correo. Así
 *   ninguna difusión vieja aparece de pronto como aviso en la barra.
 * - `lecturas_de_avisos` anota quién cerró cada aviso. Es de lo que deja cada
 *   persona, como la actividad, y lleva la misma barrera que esas tablas
 *   (D-399): desde una institución solo se lee y se escribe lo suyo. Sin las
 *   políticas, el rol `traumahub_app` la leería entera —la migración de la
 *   barrera le dio permiso sobre las tablas de mañana— y una institución vería
 *   qué avisos cerraron las cuentas de otra.
 *
 * Cada orden de la barrera en su propio `db.execute`, como en la migración que
 * la puso.
 */

/** El mismo lugar que en `20261116_150000_barrera_de_instituciones`, copiado: una migración no cambia aunque cambie la otra. */
const LUGAR = `(SELECT i.id FROM instituciones i WHERE i.subdominio = current_setting('traumahub.subdominio', true))`

const PROPIO = `institucion_id = ${LUGAR}`

const POLITICAS = [
  `CREATE POLICY traumahub_leer ON "lecturas_de_avisos" FOR SELECT USING (${PROPIO})`,
  `CREATE POLICY traumahub_crear ON "lecturas_de_avisos" FOR INSERT WITH CHECK (${PROPIO})`,
  `CREATE POLICY traumahub_cambiar ON "lecturas_de_avisos" FOR UPDATE USING (${PROPIO}) WITH CHECK (${PROPIO})`,
  `CREATE POLICY traumahub_borrar ON "lecturas_de_avisos" FOR DELETE USING (${PROPIO})`,
]

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "lecturas_de_avisos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"usuario_id" integer,
  	"difusion_id" integer,
  	"leida_en" timestamp(3) with time zone,
  	"via" varchar,
  	"institucion_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "difusiones" ADD COLUMN "lugares" jsonb;
  ALTER TABLE "difusiones" ADD COLUMN "por_correo" boolean DEFAULT true;
  ALTER TABLE "difusiones" ADD COLUMN "como_aviso" boolean DEFAULT false;
  ALTER TABLE "difusiones" ADD COLUMN "aviso_hasta" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "lecturas_de_avisos_id" integer;
  ALTER TABLE "lecturas_de_avisos" ADD CONSTRAINT "lecturas_de_avisos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lecturas_de_avisos" ADD CONSTRAINT "lecturas_de_avisos_difusion_id_difusiones_id_fk" FOREIGN KEY ("difusion_id") REFERENCES "public"."difusiones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lecturas_de_avisos" ADD CONSTRAINT "lecturas_de_avisos_institucion_id_instituciones_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."instituciones"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lecturas_de_avisos_usuario_idx" ON "lecturas_de_avisos" USING btree ("usuario_id");
  CREATE INDEX "lecturas_de_avisos_difusion_idx" ON "lecturas_de_avisos" USING btree ("difusion_id");
  CREATE INDEX "lecturas_de_avisos_institucion_idx" ON "lecturas_de_avisos" USING btree ("institucion_id");
  CREATE INDEX "lecturas_de_avisos_updated_at_idx" ON "lecturas_de_avisos" USING btree ("updated_at");
  CREATE INDEX "lecturas_de_avisos_created_at_idx" ON "lecturas_de_avisos" USING btree ("created_at");
  CREATE UNIQUE INDEX "usuario_difusion_idx" ON "lecturas_de_avisos" USING btree ("usuario_id","difusion_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lecturas_de_avisos_fk" FOREIGN KEY ("lecturas_de_avisos_id") REFERENCES "public"."lecturas_de_avisos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "difusiones_aviso_hasta_idx" ON "difusiones" USING btree ("aviso_hasta");
  CREATE INDEX "payload_locked_documents_rels_lecturas_de_avisos_id_idx" ON "payload_locked_documents_rels" USING btree ("lecturas_de_avisos_id");`)

  await db.execute(sql.raw(`ALTER TABLE "lecturas_de_avisos" ENABLE ROW LEVEL SECURITY`))
  for (const orden of POLITICAS) await db.execute(sql.raw(orden))

  payload.logger.info('difusiones: lugares, canales y avisos en la plataforma, con la barrera en sus lecturas (D-406).')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Las políticas se van con la tabla.
  await db.execute(sql`
   ALTER TABLE "lecturas_de_avisos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "lecturas_de_avisos" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_lecturas_de_avisos_fk";
  
  DROP INDEX "difusiones_aviso_hasta_idx";
  DROP INDEX "payload_locked_documents_rels_lecturas_de_avisos_id_idx";
  ALTER TABLE "difusiones" DROP COLUMN "lugares";
  ALTER TABLE "difusiones" DROP COLUMN "por_correo";
  ALTER TABLE "difusiones" DROP COLUMN "como_aviso";
  ALTER TABLE "difusiones" DROP COLUMN "aviso_hasta";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "lecturas_de_avisos_id";`)
}
