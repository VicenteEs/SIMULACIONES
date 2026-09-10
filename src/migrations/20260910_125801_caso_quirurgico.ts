import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cirugias_piezas_rol" AS ENUM('piel', 'musculo', 'hueso', 'fragmento', 'implante');
  CREATE TYPE "public"."enum_cirugias_pasos_objetivo" AS ENUM('instrumento', 'trazo', 'reduccion', 'fuerza');
  CREATE TYPE "public"."enum_cirugias_eje_largo" AS ENUM('y', 'x', 'z');
  CREATE TYPE "public"."enum__cirugias_v_version_piezas_rol" AS ENUM('piel', 'musculo', 'hueso', 'fragmento', 'implante');
  CREATE TYPE "public"."enum__cirugias_v_version_pasos_objetivo" AS ENUM('instrumento', 'trazo', 'reduccion', 'fuerza');
  CREATE TYPE "public"."enum__cirugias_v_version_eje_largo" AS ENUM('y', 'x', 'z');
  CREATE TABLE "cirugias_piezas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nodo" varchar,
  	"etiqueta" varchar,
  	"rol" "enum_cirugias_piezas_rol" DEFAULT 'hueso'
  );
  
  CREATE TABLE "cirugias_pasos_muestra" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nodo" varchar
  );
  
  CREATE TABLE "_cirugias_v_version_piezas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"nodo" varchar,
  	"etiqueta" varchar,
  	"rol" "enum__cirugias_v_version_piezas_rol" DEFAULT 'hueso',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_cirugias_v_version_pasos_muestra" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"nodo" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "cirugias_pasos" ADD COLUMN "fase_id" integer;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "objetivo" "enum_cirugias_pasos_objetivo" DEFAULT 'instrumento';
  ALTER TABLE "cirugias_pasos" ADD COLUMN "instrumento_id" integer;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "puntos" numeric DEFAULT 10;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "trazo_minimo" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "trazo_maximo" numeric;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "tolerancia_desplazamiento" numeric DEFAULT 5;
  ALTER TABLE "cirugias_pasos" ADD COLUMN "tolerancia_angulacion" numeric DEFAULT 5;
  ALTER TABLE "cirugias" ADD COLUMN "hueso_id" integer;
  ALTER TABLE "cirugias" ADD COLUMN "clasificacion_id" integer;
  ALTER TABLE "cirugias" ADD COLUMN "tecnica_id" integer;
  ALTER TABLE "cirugias" ADD COLUMN "modelo_id" integer;
  ALTER TABLE "cirugias" ADD COLUMN "milimetros_por_unidad" numeric DEFAULT 1000;
  ALTER TABLE "cirugias" ADD COLUMN "eje_largo" "enum_cirugias_eje_largo" DEFAULT 'y';
  ALTER TABLE "cirugias" ADD COLUMN "desplazamiento_inicial_x" numeric DEFAULT 0;
  ALTER TABLE "cirugias" ADD COLUMN "desplazamiento_inicial_y" numeric DEFAULT 0;
  ALTER TABLE "cirugias" ADD COLUMN "desplazamiento_inicial_z" numeric DEFAULT 0;
  ALTER TABLE "cirugias" ADD COLUMN "desplazamiento_inicial_giro_x" numeric DEFAULT 0;
  ALTER TABLE "cirugias" ADD COLUMN "desplazamiento_inicial_giro_y" numeric DEFAULT 0;
  ALTER TABLE "cirugias" ADD COLUMN "desplazamiento_inicial_giro_z" numeric DEFAULT 0;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "fase_id" integer;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "objetivo" "enum__cirugias_v_version_pasos_objetivo" DEFAULT 'instrumento';
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "instrumento_id" integer;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "puntos" numeric DEFAULT 10;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "trazo_minimo" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "trazo_maximo" numeric;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "tolerancia_desplazamiento" numeric DEFAULT 5;
  ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "tolerancia_angulacion" numeric DEFAULT 5;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_hueso_id" integer;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_clasificacion_id" integer;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_tecnica_id" integer;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_modelo_id" integer;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_milimetros_por_unidad" numeric DEFAULT 1000;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_eje_largo" "enum__cirugias_v_version_eje_largo" DEFAULT 'y';
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_desplazamiento_inicial_x" numeric DEFAULT 0;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_desplazamiento_inicial_y" numeric DEFAULT 0;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_desplazamiento_inicial_z" numeric DEFAULT 0;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_desplazamiento_inicial_giro_x" numeric DEFAULT 0;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_desplazamiento_inicial_giro_y" numeric DEFAULT 0;
  ALTER TABLE "_cirugias_v" ADD COLUMN "version_desplazamiento_inicial_giro_z" numeric DEFAULT 0;
  ALTER TABLE "cirugias_piezas" ADD CONSTRAINT "cirugias_piezas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_pasos_muestra" ADD CONSTRAINT "cirugias_pasos_muestra_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias_pasos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_version_piezas" ADD CONSTRAINT "_cirugias_v_version_piezas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_version_pasos_muestra" ADD CONSTRAINT "_cirugias_v_version_pasos_muestra_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v_version_pasos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "cirugias_piezas_order_idx" ON "cirugias_piezas" USING btree ("_order");
  CREATE INDEX "cirugias_piezas_parent_id_idx" ON "cirugias_piezas" USING btree ("_parent_id");
  CREATE INDEX "cirugias_pasos_muestra_order_idx" ON "cirugias_pasos_muestra" USING btree ("_order");
  CREATE INDEX "cirugias_pasos_muestra_parent_id_idx" ON "cirugias_pasos_muestra" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_version_piezas_order_idx" ON "_cirugias_v_version_piezas" USING btree ("_order");
  CREATE INDEX "_cirugias_v_version_piezas_parent_id_idx" ON "_cirugias_v_version_piezas" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_version_pasos_muestra_order_idx" ON "_cirugias_v_version_pasos_muestra" USING btree ("_order");
  CREATE INDEX "_cirugias_v_version_pasos_muestra_parent_id_idx" ON "_cirugias_v_version_pasos_muestra" USING btree ("_parent_id");
  ALTER TABLE "cirugias_pasos" ADD CONSTRAINT "cirugias_pasos_fase_id_fases_quirurgicas_id_fk" FOREIGN KEY ("fase_id") REFERENCES "public"."fases_quirurgicas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias_pasos" ADD CONSTRAINT "cirugias_pasos_instrumento_id_instrumental_id_fk" FOREIGN KEY ("instrumento_id") REFERENCES "public"."instrumental"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias" ADD CONSTRAINT "cirugias_hueso_id_huesos_ao_id_fk" FOREIGN KEY ("hueso_id") REFERENCES "public"."huesos_ao"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias" ADD CONSTRAINT "cirugias_clasificacion_id_clasificaciones_ao_id_fk" FOREIGN KEY ("clasificacion_id") REFERENCES "public"."clasificaciones_ao"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias" ADD CONSTRAINT "cirugias_tecnica_id_tecnicas_quirurgicas_id_fk" FOREIGN KEY ("tecnica_id") REFERENCES "public"."tecnicas_quirurgicas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias" ADD CONSTRAINT "cirugias_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v_version_pasos" ADD CONSTRAINT "_cirugias_v_version_pasos_fase_id_fases_quirurgicas_id_fk" FOREIGN KEY ("fase_id") REFERENCES "public"."fases_quirurgicas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v_version_pasos" ADD CONSTRAINT "_cirugias_v_version_pasos_instrumento_id_instrumental_id_fk" FOREIGN KEY ("instrumento_id") REFERENCES "public"."instrumental"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v" ADD CONSTRAINT "_cirugias_v_version_hueso_id_huesos_ao_id_fk" FOREIGN KEY ("version_hueso_id") REFERENCES "public"."huesos_ao"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v" ADD CONSTRAINT "_cirugias_v_version_clasificacion_id_clasificaciones_ao_id_fk" FOREIGN KEY ("version_clasificacion_id") REFERENCES "public"."clasificaciones_ao"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v" ADD CONSTRAINT "_cirugias_v_version_tecnica_id_tecnicas_quirurgicas_id_fk" FOREIGN KEY ("version_tecnica_id") REFERENCES "public"."tecnicas_quirurgicas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v" ADD CONSTRAINT "_cirugias_v_version_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("version_modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "cirugias_pasos_fase_idx" ON "cirugias_pasos" USING btree ("fase_id");
  CREATE INDEX "cirugias_pasos_instrumento_idx" ON "cirugias_pasos" USING btree ("instrumento_id");
  CREATE INDEX "cirugias_hueso_idx" ON "cirugias" USING btree ("hueso_id");
  CREATE INDEX "cirugias_clasificacion_idx" ON "cirugias" USING btree ("clasificacion_id");
  CREATE INDEX "cirugias_tecnica_idx" ON "cirugias" USING btree ("tecnica_id");
  CREATE INDEX "cirugias_modelo_idx" ON "cirugias" USING btree ("modelo_id");
  CREATE INDEX "_cirugias_v_version_pasos_fase_idx" ON "_cirugias_v_version_pasos" USING btree ("fase_id");
  CREATE INDEX "_cirugias_v_version_pasos_instrumento_idx" ON "_cirugias_v_version_pasos" USING btree ("instrumento_id");
  CREATE INDEX "_cirugias_v_version_version_hueso_idx" ON "_cirugias_v" USING btree ("version_hueso_id");
  CREATE INDEX "_cirugias_v_version_version_clasificacion_idx" ON "_cirugias_v" USING btree ("version_clasificacion_id");
  CREATE INDEX "_cirugias_v_version_version_tecnica_idx" ON "_cirugias_v" USING btree ("version_tecnica_id");
  CREATE INDEX "_cirugias_v_version_version_modelo_idx" ON "_cirugias_v" USING btree ("version_modelo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cirugias_piezas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cirugias_pasos_muestra" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_cirugias_v_version_piezas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_cirugias_v_version_pasos_muestra" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cirugias_piezas" CASCADE;
  DROP TABLE "cirugias_pasos_muestra" CASCADE;
  DROP TABLE "_cirugias_v_version_piezas" CASCADE;
  DROP TABLE "_cirugias_v_version_pasos_muestra" CASCADE;
  ALTER TABLE "cirugias_pasos" DROP CONSTRAINT "cirugias_pasos_fase_id_fases_quirurgicas_id_fk";
  
  ALTER TABLE "cirugias_pasos" DROP CONSTRAINT "cirugias_pasos_instrumento_id_instrumental_id_fk";
  
  ALTER TABLE "cirugias" DROP CONSTRAINT "cirugias_hueso_id_huesos_ao_id_fk";
  
  ALTER TABLE "cirugias" DROP CONSTRAINT "cirugias_clasificacion_id_clasificaciones_ao_id_fk";
  
  ALTER TABLE "cirugias" DROP CONSTRAINT "cirugias_tecnica_id_tecnicas_quirurgicas_id_fk";
  
  ALTER TABLE "cirugias" DROP CONSTRAINT "cirugias_modelo_id_modelos_3d_id_fk";
  
  ALTER TABLE "_cirugias_v_version_pasos" DROP CONSTRAINT "_cirugias_v_version_pasos_fase_id_fases_quirurgicas_id_fk";
  
  ALTER TABLE "_cirugias_v_version_pasos" DROP CONSTRAINT "_cirugias_v_version_pasos_instrumento_id_instrumental_id_fk";
  
  ALTER TABLE "_cirugias_v" DROP CONSTRAINT "_cirugias_v_version_hueso_id_huesos_ao_id_fk";
  
  ALTER TABLE "_cirugias_v" DROP CONSTRAINT "_cirugias_v_version_clasificacion_id_clasificaciones_ao_id_fk";
  
  ALTER TABLE "_cirugias_v" DROP CONSTRAINT "_cirugias_v_version_tecnica_id_tecnicas_quirurgicas_id_fk";
  
  ALTER TABLE "_cirugias_v" DROP CONSTRAINT "_cirugias_v_version_modelo_id_modelos_3d_id_fk";
  
  DROP INDEX "cirugias_pasos_fase_idx";
  DROP INDEX "cirugias_pasos_instrumento_idx";
  DROP INDEX "cirugias_hueso_idx";
  DROP INDEX "cirugias_clasificacion_idx";
  DROP INDEX "cirugias_tecnica_idx";
  DROP INDEX "cirugias_modelo_idx";
  DROP INDEX "_cirugias_v_version_pasos_fase_idx";
  DROP INDEX "_cirugias_v_version_pasos_instrumento_idx";
  DROP INDEX "_cirugias_v_version_version_hueso_idx";
  DROP INDEX "_cirugias_v_version_version_clasificacion_idx";
  DROP INDEX "_cirugias_v_version_version_tecnica_idx";
  DROP INDEX "_cirugias_v_version_version_modelo_idx";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "fase_id";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "objetivo";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "instrumento_id";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "puntos";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "trazo_minimo";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "trazo_maximo";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "tolerancia_desplazamiento";
  ALTER TABLE "cirugias_pasos" DROP COLUMN "tolerancia_angulacion";
  ALTER TABLE "cirugias" DROP COLUMN "hueso_id";
  ALTER TABLE "cirugias" DROP COLUMN "clasificacion_id";
  ALTER TABLE "cirugias" DROP COLUMN "tecnica_id";
  ALTER TABLE "cirugias" DROP COLUMN "modelo_id";
  ALTER TABLE "cirugias" DROP COLUMN "milimetros_por_unidad";
  ALTER TABLE "cirugias" DROP COLUMN "eje_largo";
  ALTER TABLE "cirugias" DROP COLUMN "desplazamiento_inicial_x";
  ALTER TABLE "cirugias" DROP COLUMN "desplazamiento_inicial_y";
  ALTER TABLE "cirugias" DROP COLUMN "desplazamiento_inicial_z";
  ALTER TABLE "cirugias" DROP COLUMN "desplazamiento_inicial_giro_x";
  ALTER TABLE "cirugias" DROP COLUMN "desplazamiento_inicial_giro_y";
  ALTER TABLE "cirugias" DROP COLUMN "desplazamiento_inicial_giro_z";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "fase_id";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "objetivo";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "instrumento_id";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "puntos";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "trazo_minimo";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "trazo_maximo";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "tolerancia_desplazamiento";
  ALTER TABLE "_cirugias_v_version_pasos" DROP COLUMN "tolerancia_angulacion";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_hueso_id";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_clasificacion_id";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_tecnica_id";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_modelo_id";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_milimetros_por_unidad";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_eje_largo";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_desplazamiento_inicial_x";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_desplazamiento_inicial_y";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_desplazamiento_inicial_z";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_desplazamiento_inicial_giro_x";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_desplazamiento_inicial_giro_y";
  ALTER TABLE "_cirugias_v" DROP COLUMN "version_desplazamiento_inicial_giro_z";
  DROP TYPE "public"."enum_cirugias_piezas_rol";
  DROP TYPE "public"."enum_cirugias_pasos_objetivo";
  DROP TYPE "public"."enum_cirugias_eje_largo";
  DROP TYPE "public"."enum__cirugias_v_version_piezas_rol";
  DROP TYPE "public"."enum__cirugias_v_version_pasos_objetivo";
  DROP TYPE "public"."enum__cirugias_v_version_eje_largo";`)
}
