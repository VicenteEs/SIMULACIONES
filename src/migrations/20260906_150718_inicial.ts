import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('es', 'en');
  CREATE TYPE "public"."enum_usuarios_modulos_visibles" AS ENUM('patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia');
  CREATE TYPE "public"."enum_usuarios_modulos_editables" AS ENUM('patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia');
  CREATE TYPE "public"."enum_usuarios_rol" AS ENUM('admin', 'editor', 'lector');
  CREATE TYPE "public"."enum_modelos_3d_origen" AS ENUM('tc', 'rm', 'sintetico');
  CREATE TYPE "public"."enum_patologias_blocks_advertencia_tono" AS ENUM('atencion', 'error-frecuente', 'perla');
  CREATE TYPE "public"."enum_patologias_blocks_imagen_ancho" AS ENUM('completo', 'media', 'pequena');
  CREATE TYPE "public"."enum_patologias_tipo" AS ENUM('trauma', 'ortopedia');
  CREATE TYPE "public"."enum_patologias_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__patologias_v_blocks_advertencia_tono" AS ENUM('atencion', 'error-frecuente', 'perla');
  CREATE TYPE "public"."enum__patologias_v_blocks_imagen_ancho" AS ENUM('completo', 'media', 'pequena');
  CREATE TYPE "public"."enum__patologias_v_version_tipo" AS ENUM('trauma', 'ortopedia');
  CREATE TYPE "public"."enum__patologias_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__patologias_v_published_locale" AS ENUM('es', 'en');
  CREATE TYPE "public"."enum_maniobras_blocks_advertencia_tono" AS ENUM('atencion', 'error-frecuente', 'perla');
  CREATE TYPE "public"."enum_maniobras_blocks_imagen_ancho" AS ENUM('completo', 'media', 'pequena');
  CREATE TYPE "public"."enum_maniobras_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__maniobras_v_blocks_advertencia_tono" AS ENUM('atencion', 'error-frecuente', 'perla');
  CREATE TYPE "public"."enum__maniobras_v_blocks_imagen_ancho" AS ENUM('completo', 'media', 'pequena');
  CREATE TYPE "public"."enum__maniobras_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__maniobras_v_published_locale" AS ENUM('es', 'en');
  CREATE TYPE "public"."enum_casos_ao_blocks_advertencia_tono" AS ENUM('atencion', 'error-frecuente', 'perla');
  CREATE TYPE "public"."enum_casos_ao_blocks_imagen_ancho" AS ENUM('completo', 'media', 'pequena');
  CREATE TYPE "public"."enum_casos_ao_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__casos_ao_v_blocks_advertencia_tono" AS ENUM('atencion', 'error-frecuente', 'perla');
  CREATE TYPE "public"."enum__casos_ao_v_blocks_imagen_ancho" AS ENUM('completo', 'media', 'pequena');
  CREATE TYPE "public"."enum__casos_ao_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__casos_ao_v_published_locale" AS ENUM('es', 'en');
  CREATE TYPE "public"."enum_cirugias_blocks_advertencia_tono" AS ENUM('atencion', 'error-frecuente', 'perla');
  CREATE TYPE "public"."enum_cirugias_blocks_imagen_ancho" AS ENUM('completo', 'media', 'pequena');
  CREATE TYPE "public"."enum_cirugias_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__cirugias_v_blocks_advertencia_tono" AS ENUM('atencion', 'error-frecuente', 'perla');
  CREATE TYPE "public"."enum__cirugias_v_blocks_imagen_ancho" AS ENUM('completo', 'media', 'pequena');
  CREATE TYPE "public"."enum__cirugias_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__cirugias_v_published_locale" AS ENUM('es', 'en');
  CREATE TYPE "public"."enum_estudios_ia_blocks_advertencia_tono" AS ENUM('atencion', 'error-frecuente', 'perla');
  CREATE TYPE "public"."enum_estudios_ia_blocks_imagen_ancho" AS ENUM('completo', 'media', 'pequena');
  CREATE TYPE "public"."enum_estudios_ia_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__estudios_ia_v_blocks_advertencia_tono" AS ENUM('atencion', 'error-frecuente', 'perla');
  CREATE TYPE "public"."enum__estudios_ia_v_blocks_imagen_ancho" AS ENUM('completo', 'media', 'pequena');
  CREATE TYPE "public"."enum__estudios_ia_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__estudios_ia_v_published_locale" AS ENUM('es', 'en');
  CREATE TYPE "public"."enum_comentarios_coleccion" AS ENUM('patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia');
  CREATE TYPE "public"."enum_comentarios_estado" AS ENUM('pendiente', 'resuelto');
  CREATE TYPE "public"."enum_actividad_coleccion" AS ENUM('patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia');
  CREATE TABLE "usuarios_modulos_visibles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_usuarios_modulos_visibles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "usuarios_modulos_editables" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_usuarios_modulos_editables",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "usuarios_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "usuarios" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"rol" "enum_usuarios_rol" DEFAULT 'lector' NOT NULL,
  	"activo" boolean DEFAULT false,
  	"institucion" varchar,
  	"ultimo_acceso" timestamp(3) with time zone,
  	"notas" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "segmentos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"orden" numeric DEFAULT 0,
  	"zona_mapa_x" numeric,
  	"zona_mapa_y" numeric,
  	"zona_mapa_ancho" numeric,
  	"zona_mapa_alto" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "medios" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_miniatura_url" varchar,
  	"sizes_miniatura_width" numeric,
  	"sizes_miniatura_height" numeric,
  	"sizes_miniatura_mime_type" varchar,
  	"sizes_miniatura_filesize" numeric,
  	"sizes_miniatura_filename" varchar,
  	"sizes_ancho_url" varchar,
  	"sizes_ancho_width" numeric,
  	"sizes_ancho_height" numeric,
  	"sizes_ancho_mime_type" varchar,
  	"sizes_ancho_filesize" numeric,
  	"sizes_ancho_filename" varchar
  );
  
  CREATE TABLE "modelos_3d" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"origen" "enum_modelos_3d_origen" DEFAULT 'tc' NOT NULL,
  	"anonimizado" boolean DEFAULT false,
  	"triangulos" numeric,
  	"notas" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "patologias_blocks_texto" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"cuerpo" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "patologias_blocks_lista_clinica_puntos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"destacado" varchar,
  	"texto" varchar
  );
  
  CREATE TABLE "patologias_blocks_lista_clinica" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "patologias_blocks_tabla_clasificacion_filas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"descripcion" varchar
  );
  
  CREATE TABLE "patologias_blocks_tabla_clasificacion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "patologias_blocks_advertencia" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tono" "enum_patologias_blocks_advertencia_tono" DEFAULT 'atencion',
  	"texto" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "patologias_blocks_imagen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"ancho" "enum_patologias_blocks_imagen_ancho" DEFAULT 'completo',
  	"block_name" varchar
  );
  
  CREATE TABLE "patologias_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "patologias_blocks_modelo_3d" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"modelo_id" integer,
  	"pie" varchar,
  	"encuadre_escala" numeric DEFAULT 1,
  	"encuadre_giro_x" numeric DEFAULT 0,
  	"encuadre_giro_y" numeric DEFAULT 0,
  	"encuadre_giro_z" numeric DEFAULT 0,
  	"encuadre_distancia_camara" numeric DEFAULT 3,
  	"block_name" varchar
  );
  
  CREATE TABLE "patologias_fases" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"cuando" varchar,
  	"titulo" varchar,
  	"contenido" varchar,
  	"criterio" varchar
  );
  
  CREATE TABLE "patologias" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar,
  	"subtitulo" varchar,
  	"segmento_id" integer,
  	"codigo" varchar,
  	"tipo" "enum_patologias_tipo" DEFAULT 'trauma',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_patologias_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_patologias_v_blocks_texto" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"cuerpo" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_patologias_v_blocks_lista_clinica_puntos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"destacado" varchar,
  	"texto" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_patologias_v_blocks_lista_clinica" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_patologias_v_blocks_tabla_clasificacion_filas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"descripcion" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_patologias_v_blocks_tabla_clasificacion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_patologias_v_blocks_advertencia" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"tono" "enum__patologias_v_blocks_advertencia_tono" DEFAULT 'atencion',
  	"texto" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_patologias_v_blocks_imagen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"ancho" "enum__patologias_v_blocks_imagen_ancho" DEFAULT 'completo',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_patologias_v_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_patologias_v_blocks_modelo_3d" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"modelo_id" integer,
  	"pie" varchar,
  	"encuadre_escala" numeric DEFAULT 1,
  	"encuadre_giro_x" numeric DEFAULT 0,
  	"encuadre_giro_y" numeric DEFAULT 0,
  	"encuadre_giro_z" numeric DEFAULT 0,
  	"encuadre_distancia_camara" numeric DEFAULT 3,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_patologias_v_version_fases" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"cuando" varchar,
  	"titulo" varchar,
  	"contenido" varchar,
  	"criterio" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_patologias_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_nombre" varchar,
  	"version_subtitulo" varchar,
  	"version_segmento_id" integer,
  	"version_codigo" varchar,
  	"version_tipo" "enum__patologias_v_version_tipo" DEFAULT 'trauma',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__patologias_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__patologias_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "maniobras_blocks_texto" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"cuerpo" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "maniobras_blocks_lista_clinica_puntos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"destacado" varchar,
  	"texto" varchar
  );
  
  CREATE TABLE "maniobras_blocks_lista_clinica" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "maniobras_blocks_tabla_clasificacion_filas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"descripcion" varchar
  );
  
  CREATE TABLE "maniobras_blocks_tabla_clasificacion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "maniobras_blocks_advertencia" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tono" "enum_maniobras_blocks_advertencia_tono" DEFAULT 'atencion',
  	"texto" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "maniobras_blocks_imagen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"ancho" "enum_maniobras_blocks_imagen_ancho" DEFAULT 'completo',
  	"block_name" varchar
  );
  
  CREATE TABLE "maniobras_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "maniobras_blocks_modelo_3d" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"modelo_id" integer,
  	"pie" varchar,
  	"encuadre_escala" numeric DEFAULT 1,
  	"encuadre_giro_x" numeric DEFAULT 0,
  	"encuadre_giro_y" numeric DEFAULT 0,
  	"encuadre_giro_z" numeric DEFAULT 0,
  	"encuadre_distancia_camara" numeric DEFAULT 3,
  	"block_name" varchar
  );
  
  CREATE TABLE "maniobras" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar,
  	"segmento_id" integer,
  	"evalua" varchar,
  	"tecnica" jsonb,
  	"positivo" jsonb,
  	"nota" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_maniobras_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_maniobras_v_blocks_texto" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"cuerpo" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_maniobras_v_blocks_lista_clinica_puntos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"destacado" varchar,
  	"texto" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_maniobras_v_blocks_lista_clinica" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_maniobras_v_blocks_tabla_clasificacion_filas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"descripcion" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_maniobras_v_blocks_tabla_clasificacion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_maniobras_v_blocks_advertencia" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"tono" "enum__maniobras_v_blocks_advertencia_tono" DEFAULT 'atencion',
  	"texto" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_maniobras_v_blocks_imagen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"ancho" "enum__maniobras_v_blocks_imagen_ancho" DEFAULT 'completo',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_maniobras_v_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_maniobras_v_blocks_modelo_3d" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"modelo_id" integer,
  	"pie" varchar,
  	"encuadre_escala" numeric DEFAULT 1,
  	"encuadre_giro_x" numeric DEFAULT 0,
  	"encuadre_giro_y" numeric DEFAULT 0,
  	"encuadre_giro_z" numeric DEFAULT 0,
  	"encuadre_distancia_camara" numeric DEFAULT 3,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_maniobras_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_nombre" varchar,
  	"version_segmento_id" integer,
  	"version_evalua" varchar,
  	"version_tecnica" jsonb,
  	"version_positivo" jsonb,
  	"version_nota" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__maniobras_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__maniobras_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "casos_ao_pasos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"descripcion" jsonb,
  	"principio" varchar,
  	"nota" jsonb,
  	"modelo_id" integer
  );
  
  CREATE TABLE "casos_ao_blocks_texto" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"cuerpo" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "casos_ao_blocks_lista_clinica_puntos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"destacado" varchar,
  	"texto" varchar
  );
  
  CREATE TABLE "casos_ao_blocks_lista_clinica" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "casos_ao_blocks_tabla_clasificacion_filas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"descripcion" varchar
  );
  
  CREATE TABLE "casos_ao_blocks_tabla_clasificacion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "casos_ao_blocks_advertencia" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tono" "enum_casos_ao_blocks_advertencia_tono" DEFAULT 'atencion',
  	"texto" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "casos_ao_blocks_imagen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"ancho" "enum_casos_ao_blocks_imagen_ancho" DEFAULT 'completo',
  	"block_name" varchar
  );
  
  CREATE TABLE "casos_ao_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "casos_ao_blocks_modelo_3d" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"modelo_id" integer,
  	"pie" varchar,
  	"encuadre_escala" numeric DEFAULT 1,
  	"encuadre_giro_x" numeric DEFAULT 0,
  	"encuadre_giro_y" numeric DEFAULT 0,
  	"encuadre_giro_z" numeric DEFAULT 0,
  	"encuadre_distancia_camara" numeric DEFAULT 3,
  	"block_name" varchar
  );
  
  CREATE TABLE "casos_ao" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"codigo" varchar,
  	"procedimiento" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_casos_ao_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_casos_ao_v_version_pasos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"descripcion" jsonb,
  	"principio" varchar,
  	"nota" jsonb,
  	"modelo_id" integer,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_texto" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"cuerpo" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_lista_clinica_puntos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"destacado" varchar,
  	"texto" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_lista_clinica" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_tabla_clasificacion_filas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"descripcion" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_tabla_clasificacion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_advertencia" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"tono" "enum__casos_ao_v_blocks_advertencia_tono" DEFAULT 'atencion',
  	"texto" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_imagen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"ancho" "enum__casos_ao_v_blocks_imagen_ancho" DEFAULT 'completo',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_casos_ao_v_blocks_modelo_3d" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"modelo_id" integer,
  	"pie" varchar,
  	"encuadre_escala" numeric DEFAULT 1,
  	"encuadre_giro_x" numeric DEFAULT 0,
  	"encuadre_giro_y" numeric DEFAULT 0,
  	"encuadre_giro_z" numeric DEFAULT 0,
  	"encuadre_distancia_camara" numeric DEFAULT 3,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_casos_ao_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_titulo" varchar,
  	"version_codigo" varchar,
  	"version_procedimiento" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__casos_ao_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__casos_ao_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "cirugias_pasos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"descripcion" jsonb,
  	"instrumento" varchar,
  	"fuerza_minima" numeric,
  	"fuerza_maxima" numeric,
  	"exito" varchar,
  	"insuficiente" varchar,
  	"excesivo" varchar,
  	"riesgo" jsonb
  );
  
  CREATE TABLE "cirugias_blocks_texto" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"cuerpo" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "cirugias_blocks_lista_clinica_puntos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"destacado" varchar,
  	"texto" varchar
  );
  
  CREATE TABLE "cirugias_blocks_lista_clinica" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cirugias_blocks_tabla_clasificacion_filas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"descripcion" varchar
  );
  
  CREATE TABLE "cirugias_blocks_tabla_clasificacion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cirugias_blocks_advertencia" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tono" "enum_cirugias_blocks_advertencia_tono" DEFAULT 'atencion',
  	"texto" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cirugias_blocks_imagen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"ancho" "enum_cirugias_blocks_imagen_ancho" DEFAULT 'completo',
  	"block_name" varchar
  );
  
  CREATE TABLE "cirugias_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cirugias_blocks_modelo_3d" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"modelo_id" integer,
  	"pie" varchar,
  	"encuadre_escala" numeric DEFAULT 1,
  	"encuadre_giro_x" numeric DEFAULT 0,
  	"encuadre_giro_y" numeric DEFAULT 0,
  	"encuadre_giro_z" numeric DEFAULT 0,
  	"encuadre_distancia_camara" numeric DEFAULT 3,
  	"block_name" varchar
  );
  
  CREATE TABLE "cirugias" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar,
  	"codigo" varchar,
  	"resumen" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_cirugias_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_cirugias_v_version_pasos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"descripcion" jsonb,
  	"instrumento" varchar,
  	"fuerza_minima" numeric,
  	"fuerza_maxima" numeric,
  	"exito" varchar,
  	"insuficiente" varchar,
  	"excesivo" varchar,
  	"riesgo" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_texto" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"cuerpo" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_lista_clinica_puntos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"destacado" varchar,
  	"texto" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_lista_clinica" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_tabla_clasificacion_filas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"descripcion" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_tabla_clasificacion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_advertencia" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"tono" "enum__cirugias_v_blocks_advertencia_tono" DEFAULT 'atencion',
  	"texto" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_imagen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"ancho" "enum__cirugias_v_blocks_imagen_ancho" DEFAULT 'completo',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_cirugias_v_blocks_modelo_3d" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"modelo_id" integer,
  	"pie" varchar,
  	"encuadre_escala" numeric DEFAULT 1,
  	"encuadre_giro_x" numeric DEFAULT 0,
  	"encuadre_giro_y" numeric DEFAULT 0,
  	"encuadre_giro_z" numeric DEFAULT 0,
  	"encuadre_distancia_camara" numeric DEFAULT 3,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_cirugias_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_nombre" varchar,
  	"version_codigo" varchar,
  	"version_resumen" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__cirugias_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__cirugias_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "estudios_ia_hallazgos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"texto" varchar
  );
  
  CREATE TABLE "estudios_ia_opciones_a_favor" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"texto" varchar
  );
  
  CREATE TABLE "estudios_ia_opciones_en_contra" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"texto" varchar
  );
  
  CREATE TABLE "estudios_ia_opciones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"frecuente" boolean
  );
  
  CREATE TABLE "estudios_ia_blocks_texto" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"cuerpo" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "estudios_ia_blocks_lista_clinica_puntos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"destacado" varchar,
  	"texto" varchar
  );
  
  CREATE TABLE "estudios_ia_blocks_lista_clinica" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "estudios_ia_blocks_tabla_clasificacion_filas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"descripcion" varchar
  );
  
  CREATE TABLE "estudios_ia_blocks_tabla_clasificacion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "estudios_ia_blocks_advertencia" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tono" "enum_estudios_ia_blocks_advertencia_tono" DEFAULT 'atencion',
  	"texto" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "estudios_ia_blocks_imagen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"ancho" "enum_estudios_ia_blocks_imagen_ancho" DEFAULT 'completo',
  	"block_name" varchar
  );
  
  CREATE TABLE "estudios_ia_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"pie" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "estudios_ia_blocks_modelo_3d" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"modelo_id" integer,
  	"pie" varchar,
  	"encuadre_escala" numeric DEFAULT 1,
  	"encuadre_giro_x" numeric DEFAULT 0,
  	"encuadre_giro_y" numeric DEFAULT 0,
  	"encuadre_giro_z" numeric DEFAULT 0,
  	"encuadre_distancia_camara" numeric DEFAULT 3,
  	"block_name" varchar
  );
  
  CREATE TABLE "estudios_ia" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar,
  	"codigo" varchar,
  	"confianza" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_estudios_ia_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_estudios_ia_v_version_hallazgos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"texto" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_version_opciones_a_favor" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"texto" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_version_opciones_en_contra" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"texto" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_version_opciones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"frecuente" boolean,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_texto" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"cuerpo" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_lista_clinica_puntos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"destacado" varchar,
  	"texto" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_lista_clinica" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_tabla_clasificacion_filas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"descripcion" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_tabla_clasificacion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_advertencia" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"tono" "enum__estudios_ia_v_blocks_advertencia_tono" DEFAULT 'atencion',
  	"texto" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_imagen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"ancho" "enum__estudios_ia_v_blocks_imagen_ancho" DEFAULT 'completo',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"pie" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_estudios_ia_v_blocks_modelo_3d" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"modelo_id" integer,
  	"pie" varchar,
  	"encuadre_escala" numeric DEFAULT 1,
  	"encuadre_giro_x" numeric DEFAULT 0,
  	"encuadre_giro_y" numeric DEFAULT 0,
  	"encuadre_giro_z" numeric DEFAULT 0,
  	"encuadre_distancia_camara" numeric DEFAULT 3,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_estudios_ia_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_nombre" varchar,
  	"version_codigo" varchar,
  	"version_confianza" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__estudios_ia_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__estudios_ia_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "comentarios" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"usuario_id" integer,
  	"coleccion" "enum_comentarios_coleccion" NOT NULL,
  	"documento_id" varchar NOT NULL,
  	"texto" varchar NOT NULL,
  	"estado" "enum_comentarios_estado" DEFAULT 'pendiente' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "actividad" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"usuario_id" integer NOT NULL,
  	"coleccion" "enum_actividad_coleccion" NOT NULL,
  	"documento_id" varchar NOT NULL,
  	"ultima_visita" timestamp(3) with time zone,
  	"completado" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"usuarios_id" integer,
  	"segmentos_id" integer,
  	"medios_id" integer,
  	"modelos_3d_id" integer,
  	"patologias_id" integer,
  	"maniobras_id" integer,
  	"casos_ao_id" integer,
  	"cirugias_id" integer,
  	"estudios_ia_id" integer,
  	"comentarios_id" integer,
  	"actividad_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"usuarios_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "usuarios_modulos_visibles" ADD CONSTRAINT "usuarios_modulos_visibles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "usuarios_modulos_editables" ADD CONSTRAINT "usuarios_modulos_editables_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "usuarios_sessions" ADD CONSTRAINT "usuarios_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias_blocks_texto" ADD CONSTRAINT "patologias_blocks_texto_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias_blocks_lista_clinica_puntos" ADD CONSTRAINT "patologias_blocks_lista_clinica_puntos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias_blocks_lista_clinica"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias_blocks_lista_clinica" ADD CONSTRAINT "patologias_blocks_lista_clinica_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias_blocks_tabla_clasificacion_filas" ADD CONSTRAINT "patologias_blocks_tabla_clasificacion_filas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias_blocks_tabla_clasificacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias_blocks_tabla_clasificacion" ADD CONSTRAINT "patologias_blocks_tabla_clasificacion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias_blocks_advertencia" ADD CONSTRAINT "patologias_blocks_advertencia_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias_blocks_imagen" ADD CONSTRAINT "patologias_blocks_imagen_imagen_id_medios_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "patologias_blocks_imagen" ADD CONSTRAINT "patologias_blocks_imagen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias_blocks_video" ADD CONSTRAINT "patologias_blocks_video_video_id_medios_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "patologias_blocks_video" ADD CONSTRAINT "patologias_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias_blocks_modelo_3d" ADD CONSTRAINT "patologias_blocks_modelo_3d_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "patologias_blocks_modelo_3d" ADD CONSTRAINT "patologias_blocks_modelo_3d_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias_fases" ADD CONSTRAINT "patologias_fases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "patologias" ADD CONSTRAINT "patologias_segmento_id_segmentos_id_fk" FOREIGN KEY ("segmento_id") REFERENCES "public"."segmentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_texto" ADD CONSTRAINT "_patologias_v_blocks_texto_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_lista_clinica_puntos" ADD CONSTRAINT "_patologias_v_blocks_lista_clinica_puntos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v_blocks_lista_clinica"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_lista_clinica" ADD CONSTRAINT "_patologias_v_blocks_lista_clinica_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_tabla_clasificacion_filas" ADD CONSTRAINT "_patologias_v_blocks_tabla_clasificacion_filas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v_blocks_tabla_clasificacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_tabla_clasificacion" ADD CONSTRAINT "_patologias_v_blocks_tabla_clasificacion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_advertencia" ADD CONSTRAINT "_patologias_v_blocks_advertencia_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_imagen" ADD CONSTRAINT "_patologias_v_blocks_imagen_imagen_id_medios_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_imagen" ADD CONSTRAINT "_patologias_v_blocks_imagen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_video" ADD CONSTRAINT "_patologias_v_blocks_video_video_id_medios_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_video" ADD CONSTRAINT "_patologias_v_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ADD CONSTRAINT "_patologias_v_blocks_modelo_3d_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ADD CONSTRAINT "_patologias_v_blocks_modelo_3d_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v_version_fases" ADD CONSTRAINT "_patologias_v_version_fases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_patologias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_patologias_v" ADD CONSTRAINT "_patologias_v_parent_id_patologias_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."patologias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_patologias_v" ADD CONSTRAINT "_patologias_v_version_segmento_id_segmentos_id_fk" FOREIGN KEY ("version_segmento_id") REFERENCES "public"."segmentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_texto" ADD CONSTRAINT "maniobras_blocks_texto_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_lista_clinica_puntos" ADD CONSTRAINT "maniobras_blocks_lista_clinica_puntos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras_blocks_lista_clinica"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_lista_clinica" ADD CONSTRAINT "maniobras_blocks_lista_clinica_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_tabla_clasificacion_filas" ADD CONSTRAINT "maniobras_blocks_tabla_clasificacion_filas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras_blocks_tabla_clasificacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_tabla_clasificacion" ADD CONSTRAINT "maniobras_blocks_tabla_clasificacion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_advertencia" ADD CONSTRAINT "maniobras_blocks_advertencia_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_imagen" ADD CONSTRAINT "maniobras_blocks_imagen_imagen_id_medios_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_imagen" ADD CONSTRAINT "maniobras_blocks_imagen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_video" ADD CONSTRAINT "maniobras_blocks_video_video_id_medios_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_video" ADD CONSTRAINT "maniobras_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_modelo_3d" ADD CONSTRAINT "maniobras_blocks_modelo_3d_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "maniobras_blocks_modelo_3d" ADD CONSTRAINT "maniobras_blocks_modelo_3d_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."maniobras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maniobras" ADD CONSTRAINT "maniobras_segmento_id_segmentos_id_fk" FOREIGN KEY ("segmento_id") REFERENCES "public"."segmentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_texto" ADD CONSTRAINT "_maniobras_v_blocks_texto_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_lista_clinica_puntos" ADD CONSTRAINT "_maniobras_v_blocks_lista_clinica_puntos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v_blocks_lista_clinica"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_lista_clinica" ADD CONSTRAINT "_maniobras_v_blocks_lista_clinica_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_tabla_clasificacion_filas" ADD CONSTRAINT "_maniobras_v_blocks_tabla_clasificacion_filas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v_blocks_tabla_clasificacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_tabla_clasificacion" ADD CONSTRAINT "_maniobras_v_blocks_tabla_clasificacion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_advertencia" ADD CONSTRAINT "_maniobras_v_blocks_advertencia_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_imagen" ADD CONSTRAINT "_maniobras_v_blocks_imagen_imagen_id_medios_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_imagen" ADD CONSTRAINT "_maniobras_v_blocks_imagen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_video" ADD CONSTRAINT "_maniobras_v_blocks_video_video_id_medios_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_video" ADD CONSTRAINT "_maniobras_v_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ADD CONSTRAINT "_maniobras_v_blocks_modelo_3d_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ADD CONSTRAINT "_maniobras_v_blocks_modelo_3d_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_maniobras_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_maniobras_v" ADD CONSTRAINT "_maniobras_v_parent_id_maniobras_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."maniobras"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_maniobras_v" ADD CONSTRAINT "_maniobras_v_version_segmento_id_segmentos_id_fk" FOREIGN KEY ("version_segmento_id") REFERENCES "public"."segmentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "casos_ao_pasos" ADD CONSTRAINT "casos_ao_pasos_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "casos_ao_pasos" ADD CONSTRAINT "casos_ao_pasos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_texto" ADD CONSTRAINT "casos_ao_blocks_texto_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_lista_clinica_puntos" ADD CONSTRAINT "casos_ao_blocks_lista_clinica_puntos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao_blocks_lista_clinica"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_lista_clinica" ADD CONSTRAINT "casos_ao_blocks_lista_clinica_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_tabla_clasificacion_filas" ADD CONSTRAINT "casos_ao_blocks_tabla_clasificacion_filas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao_blocks_tabla_clasificacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_tabla_clasificacion" ADD CONSTRAINT "casos_ao_blocks_tabla_clasificacion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_advertencia" ADD CONSTRAINT "casos_ao_blocks_advertencia_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_imagen" ADD CONSTRAINT "casos_ao_blocks_imagen_imagen_id_medios_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_imagen" ADD CONSTRAINT "casos_ao_blocks_imagen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_video" ADD CONSTRAINT "casos_ao_blocks_video_video_id_medios_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_video" ADD CONSTRAINT "casos_ao_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ADD CONSTRAINT "casos_ao_blocks_modelo_3d_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ADD CONSTRAINT "casos_ao_blocks_modelo_3d_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_version_pasos" ADD CONSTRAINT "_casos_ao_v_version_pasos_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_version_pasos" ADD CONSTRAINT "_casos_ao_v_version_pasos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_texto" ADD CONSTRAINT "_casos_ao_v_blocks_texto_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_lista_clinica_puntos" ADD CONSTRAINT "_casos_ao_v_blocks_lista_clinica_puntos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v_blocks_lista_clinica"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_lista_clinica" ADD CONSTRAINT "_casos_ao_v_blocks_lista_clinica_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_tabla_clasificacion_filas" ADD CONSTRAINT "_casos_ao_v_blocks_tabla_clasificacion_filas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v_blocks_tabla_clasificacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_tabla_clasificacion" ADD CONSTRAINT "_casos_ao_v_blocks_tabla_clasificacion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_advertencia" ADD CONSTRAINT "_casos_ao_v_blocks_advertencia_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_imagen" ADD CONSTRAINT "_casos_ao_v_blocks_imagen_imagen_id_medios_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_imagen" ADD CONSTRAINT "_casos_ao_v_blocks_imagen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_video" ADD CONSTRAINT "_casos_ao_v_blocks_video_video_id_medios_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_video" ADD CONSTRAINT "_casos_ao_v_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ADD CONSTRAINT "_casos_ao_v_blocks_modelo_3d_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ADD CONSTRAINT "_casos_ao_v_blocks_modelo_3d_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_casos_ao_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_casos_ao_v" ADD CONSTRAINT "_casos_ao_v_parent_id_casos_ao_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."casos_ao"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias_pasos" ADD CONSTRAINT "cirugias_pasos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_texto" ADD CONSTRAINT "cirugias_blocks_texto_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_lista_clinica_puntos" ADD CONSTRAINT "cirugias_blocks_lista_clinica_puntos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias_blocks_lista_clinica"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_lista_clinica" ADD CONSTRAINT "cirugias_blocks_lista_clinica_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_tabla_clasificacion_filas" ADD CONSTRAINT "cirugias_blocks_tabla_clasificacion_filas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias_blocks_tabla_clasificacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_tabla_clasificacion" ADD CONSTRAINT "cirugias_blocks_tabla_clasificacion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_advertencia" ADD CONSTRAINT "cirugias_blocks_advertencia_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_imagen" ADD CONSTRAINT "cirugias_blocks_imagen_imagen_id_medios_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_imagen" ADD CONSTRAINT "cirugias_blocks_imagen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_video" ADD CONSTRAINT "cirugias_blocks_video_video_id_medios_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_video" ADD CONSTRAINT "cirugias_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_modelo_3d" ADD CONSTRAINT "cirugias_blocks_modelo_3d_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cirugias_blocks_modelo_3d" ADD CONSTRAINT "cirugias_blocks_modelo_3d_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_version_pasos" ADD CONSTRAINT "_cirugias_v_version_pasos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_texto" ADD CONSTRAINT "_cirugias_v_blocks_texto_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_lista_clinica_puntos" ADD CONSTRAINT "_cirugias_v_blocks_lista_clinica_puntos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v_blocks_lista_clinica"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_lista_clinica" ADD CONSTRAINT "_cirugias_v_blocks_lista_clinica_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_tabla_clasificacion_filas" ADD CONSTRAINT "_cirugias_v_blocks_tabla_clasificacion_filas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v_blocks_tabla_clasificacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_tabla_clasificacion" ADD CONSTRAINT "_cirugias_v_blocks_tabla_clasificacion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_advertencia" ADD CONSTRAINT "_cirugias_v_blocks_advertencia_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_imagen" ADD CONSTRAINT "_cirugias_v_blocks_imagen_imagen_id_medios_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_imagen" ADD CONSTRAINT "_cirugias_v_blocks_imagen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_video" ADD CONSTRAINT "_cirugias_v_blocks_video_video_id_medios_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_video" ADD CONSTRAINT "_cirugias_v_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ADD CONSTRAINT "_cirugias_v_blocks_modelo_3d_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ADD CONSTRAINT "_cirugias_v_blocks_modelo_3d_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cirugias_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cirugias_v" ADD CONSTRAINT "_cirugias_v_parent_id_cirugias_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cirugias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "estudios_ia_hallazgos" ADD CONSTRAINT "estudios_ia_hallazgos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_opciones_a_favor" ADD CONSTRAINT "estudios_ia_opciones_a_favor_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia_opciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_opciones_en_contra" ADD CONSTRAINT "estudios_ia_opciones_en_contra_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia_opciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_opciones" ADD CONSTRAINT "estudios_ia_opciones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_texto" ADD CONSTRAINT "estudios_ia_blocks_texto_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_lista_clinica_puntos" ADD CONSTRAINT "estudios_ia_blocks_lista_clinica_puntos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia_blocks_lista_clinica"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_lista_clinica" ADD CONSTRAINT "estudios_ia_blocks_lista_clinica_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_tabla_clasificacion_filas" ADD CONSTRAINT "estudios_ia_blocks_tabla_clasificacion_filas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia_blocks_tabla_clasificacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_tabla_clasificacion" ADD CONSTRAINT "estudios_ia_blocks_tabla_clasificacion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_advertencia" ADD CONSTRAINT "estudios_ia_blocks_advertencia_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_imagen" ADD CONSTRAINT "estudios_ia_blocks_imagen_imagen_id_medios_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_imagen" ADD CONSTRAINT "estudios_ia_blocks_imagen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_video" ADD CONSTRAINT "estudios_ia_blocks_video_video_id_medios_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_video" ADD CONSTRAINT "estudios_ia_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ADD CONSTRAINT "estudios_ia_blocks_modelo_3d_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ADD CONSTRAINT "estudios_ia_blocks_modelo_3d_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_version_hallazgos" ADD CONSTRAINT "_estudios_ia_v_version_hallazgos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_version_opciones_a_favor" ADD CONSTRAINT "_estudios_ia_v_version_opciones_a_favor_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v_version_opciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_version_opciones_en_contra" ADD CONSTRAINT "_estudios_ia_v_version_opciones_en_contra_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v_version_opciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_version_opciones" ADD CONSTRAINT "_estudios_ia_v_version_opciones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_texto" ADD CONSTRAINT "_estudios_ia_v_blocks_texto_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_lista_clinica_puntos" ADD CONSTRAINT "_estudios_ia_v_blocks_lista_clinica_puntos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v_blocks_lista_clinica"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_lista_clinica" ADD CONSTRAINT "_estudios_ia_v_blocks_lista_clinica_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_tabla_clasificacion_filas" ADD CONSTRAINT "_estudios_ia_v_blocks_tabla_clasificacion_filas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v_blocks_tabla_clasificacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_tabla_clasificacion" ADD CONSTRAINT "_estudios_ia_v_blocks_tabla_clasificacion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_advertencia" ADD CONSTRAINT "_estudios_ia_v_blocks_advertencia_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_imagen" ADD CONSTRAINT "_estudios_ia_v_blocks_imagen_imagen_id_medios_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_imagen" ADD CONSTRAINT "_estudios_ia_v_blocks_imagen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_video" ADD CONSTRAINT "_estudios_ia_v_blocks_video_video_id_medios_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_video" ADD CONSTRAINT "_estudios_ia_v_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ADD CONSTRAINT "_estudios_ia_v_blocks_modelo_3d_modelo_id_modelos_3d_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos_3d"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ADD CONSTRAINT "_estudios_ia_v_blocks_modelo_3d_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_estudios_ia_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_estudios_ia_v" ADD CONSTRAINT "_estudios_ia_v_parent_id_estudios_ia_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."estudios_ia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "actividad" ADD CONSTRAINT "actividad_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_usuarios_fk" FOREIGN KEY ("usuarios_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_segmentos_fk" FOREIGN KEY ("segmentos_id") REFERENCES "public"."segmentos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_medios_fk" FOREIGN KEY ("medios_id") REFERENCES "public"."medios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_modelos_3d_fk" FOREIGN KEY ("modelos_3d_id") REFERENCES "public"."modelos_3d"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_patologias_fk" FOREIGN KEY ("patologias_id") REFERENCES "public"."patologias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_maniobras_fk" FOREIGN KEY ("maniobras_id") REFERENCES "public"."maniobras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_casos_ao_fk" FOREIGN KEY ("casos_ao_id") REFERENCES "public"."casos_ao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cirugias_fk" FOREIGN KEY ("cirugias_id") REFERENCES "public"."cirugias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_estudios_ia_fk" FOREIGN KEY ("estudios_ia_id") REFERENCES "public"."estudios_ia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comentarios_fk" FOREIGN KEY ("comentarios_id") REFERENCES "public"."comentarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_actividad_fk" FOREIGN KEY ("actividad_id") REFERENCES "public"."actividad"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_usuarios_fk" FOREIGN KEY ("usuarios_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "usuarios_modulos_visibles_order_idx" ON "usuarios_modulos_visibles" USING btree ("order");
  CREATE INDEX "usuarios_modulos_visibles_parent_idx" ON "usuarios_modulos_visibles" USING btree ("parent_id");
  CREATE INDEX "usuarios_modulos_editables_order_idx" ON "usuarios_modulos_editables" USING btree ("order");
  CREATE INDEX "usuarios_modulos_editables_parent_idx" ON "usuarios_modulos_editables" USING btree ("parent_id");
  CREATE INDEX "usuarios_sessions_order_idx" ON "usuarios_sessions" USING btree ("_order");
  CREATE INDEX "usuarios_sessions_parent_id_idx" ON "usuarios_sessions" USING btree ("_parent_id");
  CREATE INDEX "usuarios_rol_idx" ON "usuarios" USING btree ("rol");
  CREATE INDEX "usuarios_activo_idx" ON "usuarios" USING btree ("activo");
  CREATE INDEX "usuarios_updated_at_idx" ON "usuarios" USING btree ("updated_at");
  CREATE INDEX "usuarios_created_at_idx" ON "usuarios" USING btree ("created_at");
  CREATE UNIQUE INDEX "usuarios_email_idx" ON "usuarios" USING btree ("email");
  CREATE INDEX "segmentos_updated_at_idx" ON "segmentos" USING btree ("updated_at");
  CREATE INDEX "segmentos_created_at_idx" ON "segmentos" USING btree ("created_at");
  CREATE INDEX "medios_updated_at_idx" ON "medios" USING btree ("updated_at");
  CREATE INDEX "medios_created_at_idx" ON "medios" USING btree ("created_at");
  CREATE UNIQUE INDEX "medios_filename_idx" ON "medios" USING btree ("filename");
  CREATE INDEX "medios_sizes_miniatura_sizes_miniatura_filename_idx" ON "medios" USING btree ("sizes_miniatura_filename");
  CREATE INDEX "medios_sizes_ancho_sizes_ancho_filename_idx" ON "medios" USING btree ("sizes_ancho_filename");
  CREATE INDEX "modelos_3d_updated_at_idx" ON "modelos_3d" USING btree ("updated_at");
  CREATE INDEX "modelos_3d_created_at_idx" ON "modelos_3d" USING btree ("created_at");
  CREATE UNIQUE INDEX "modelos_3d_filename_idx" ON "modelos_3d" USING btree ("filename");
  CREATE INDEX "patologias_blocks_texto_order_idx" ON "patologias_blocks_texto" USING btree ("_order");
  CREATE INDEX "patologias_blocks_texto_parent_id_idx" ON "patologias_blocks_texto" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_texto_path_idx" ON "patologias_blocks_texto" USING btree ("_path");
  CREATE INDEX "patologias_blocks_lista_clinica_puntos_order_idx" ON "patologias_blocks_lista_clinica_puntos" USING btree ("_order");
  CREATE INDEX "patologias_blocks_lista_clinica_puntos_parent_id_idx" ON "patologias_blocks_lista_clinica_puntos" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_lista_clinica_order_idx" ON "patologias_blocks_lista_clinica" USING btree ("_order");
  CREATE INDEX "patologias_blocks_lista_clinica_parent_id_idx" ON "patologias_blocks_lista_clinica" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_lista_clinica_path_idx" ON "patologias_blocks_lista_clinica" USING btree ("_path");
  CREATE INDEX "patologias_blocks_tabla_clasificacion_filas_order_idx" ON "patologias_blocks_tabla_clasificacion_filas" USING btree ("_order");
  CREATE INDEX "patologias_blocks_tabla_clasificacion_filas_parent_id_idx" ON "patologias_blocks_tabla_clasificacion_filas" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_tabla_clasificacion_order_idx" ON "patologias_blocks_tabla_clasificacion" USING btree ("_order");
  CREATE INDEX "patologias_blocks_tabla_clasificacion_parent_id_idx" ON "patologias_blocks_tabla_clasificacion" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_tabla_clasificacion_path_idx" ON "patologias_blocks_tabla_clasificacion" USING btree ("_path");
  CREATE INDEX "patologias_blocks_advertencia_order_idx" ON "patologias_blocks_advertencia" USING btree ("_order");
  CREATE INDEX "patologias_blocks_advertencia_parent_id_idx" ON "patologias_blocks_advertencia" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_advertencia_path_idx" ON "patologias_blocks_advertencia" USING btree ("_path");
  CREATE INDEX "patologias_blocks_imagen_order_idx" ON "patologias_blocks_imagen" USING btree ("_order");
  CREATE INDEX "patologias_blocks_imagen_parent_id_idx" ON "patologias_blocks_imagen" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_imagen_path_idx" ON "patologias_blocks_imagen" USING btree ("_path");
  CREATE INDEX "patologias_blocks_imagen_imagen_idx" ON "patologias_blocks_imagen" USING btree ("imagen_id");
  CREATE INDEX "patologias_blocks_video_order_idx" ON "patologias_blocks_video" USING btree ("_order");
  CREATE INDEX "patologias_blocks_video_parent_id_idx" ON "patologias_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_video_path_idx" ON "patologias_blocks_video" USING btree ("_path");
  CREATE INDEX "patologias_blocks_video_video_idx" ON "patologias_blocks_video" USING btree ("video_id");
  CREATE INDEX "patologias_blocks_modelo_3d_order_idx" ON "patologias_blocks_modelo_3d" USING btree ("_order");
  CREATE INDEX "patologias_blocks_modelo_3d_parent_id_idx" ON "patologias_blocks_modelo_3d" USING btree ("_parent_id");
  CREATE INDEX "patologias_blocks_modelo_3d_path_idx" ON "patologias_blocks_modelo_3d" USING btree ("_path");
  CREATE INDEX "patologias_blocks_modelo_3d_modelo_idx" ON "patologias_blocks_modelo_3d" USING btree ("modelo_id");
  CREATE INDEX "patologias_fases_order_idx" ON "patologias_fases" USING btree ("_order");
  CREATE INDEX "patologias_fases_parent_id_idx" ON "patologias_fases" USING btree ("_parent_id");
  CREATE INDEX "patologias_segmento_idx" ON "patologias" USING btree ("segmento_id");
  CREATE INDEX "patologias_updated_at_idx" ON "patologias" USING btree ("updated_at");
  CREATE INDEX "patologias_created_at_idx" ON "patologias" USING btree ("created_at");
  CREATE INDEX "patologias__status_idx" ON "patologias" USING btree ("_status");
  CREATE INDEX "_patologias_v_blocks_texto_order_idx" ON "_patologias_v_blocks_texto" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_texto_parent_id_idx" ON "_patologias_v_blocks_texto" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_texto_path_idx" ON "_patologias_v_blocks_texto" USING btree ("_path");
  CREATE INDEX "_patologias_v_blocks_lista_clinica_puntos_order_idx" ON "_patologias_v_blocks_lista_clinica_puntos" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_lista_clinica_puntos_parent_id_idx" ON "_patologias_v_blocks_lista_clinica_puntos" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_lista_clinica_order_idx" ON "_patologias_v_blocks_lista_clinica" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_lista_clinica_parent_id_idx" ON "_patologias_v_blocks_lista_clinica" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_lista_clinica_path_idx" ON "_patologias_v_blocks_lista_clinica" USING btree ("_path");
  CREATE INDEX "_patologias_v_blocks_tabla_clasificacion_filas_order_idx" ON "_patologias_v_blocks_tabla_clasificacion_filas" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_tabla_clasificacion_filas_parent_id_idx" ON "_patologias_v_blocks_tabla_clasificacion_filas" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_tabla_clasificacion_order_idx" ON "_patologias_v_blocks_tabla_clasificacion" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_tabla_clasificacion_parent_id_idx" ON "_patologias_v_blocks_tabla_clasificacion" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_tabla_clasificacion_path_idx" ON "_patologias_v_blocks_tabla_clasificacion" USING btree ("_path");
  CREATE INDEX "_patologias_v_blocks_advertencia_order_idx" ON "_patologias_v_blocks_advertencia" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_advertencia_parent_id_idx" ON "_patologias_v_blocks_advertencia" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_advertencia_path_idx" ON "_patologias_v_blocks_advertencia" USING btree ("_path");
  CREATE INDEX "_patologias_v_blocks_imagen_order_idx" ON "_patologias_v_blocks_imagen" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_imagen_parent_id_idx" ON "_patologias_v_blocks_imagen" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_imagen_path_idx" ON "_patologias_v_blocks_imagen" USING btree ("_path");
  CREATE INDEX "_patologias_v_blocks_imagen_imagen_idx" ON "_patologias_v_blocks_imagen" USING btree ("imagen_id");
  CREATE INDEX "_patologias_v_blocks_video_order_idx" ON "_patologias_v_blocks_video" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_video_parent_id_idx" ON "_patologias_v_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_video_path_idx" ON "_patologias_v_blocks_video" USING btree ("_path");
  CREATE INDEX "_patologias_v_blocks_video_video_idx" ON "_patologias_v_blocks_video" USING btree ("video_id");
  CREATE INDEX "_patologias_v_blocks_modelo_3d_order_idx" ON "_patologias_v_blocks_modelo_3d" USING btree ("_order");
  CREATE INDEX "_patologias_v_blocks_modelo_3d_parent_id_idx" ON "_patologias_v_blocks_modelo_3d" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_blocks_modelo_3d_path_idx" ON "_patologias_v_blocks_modelo_3d" USING btree ("_path");
  CREATE INDEX "_patologias_v_blocks_modelo_3d_modelo_idx" ON "_patologias_v_blocks_modelo_3d" USING btree ("modelo_id");
  CREATE INDEX "_patologias_v_version_fases_order_idx" ON "_patologias_v_version_fases" USING btree ("_order");
  CREATE INDEX "_patologias_v_version_fases_parent_id_idx" ON "_patologias_v_version_fases" USING btree ("_parent_id");
  CREATE INDEX "_patologias_v_parent_idx" ON "_patologias_v" USING btree ("parent_id");
  CREATE INDEX "_patologias_v_version_version_segmento_idx" ON "_patologias_v" USING btree ("version_segmento_id");
  CREATE INDEX "_patologias_v_version_version_updated_at_idx" ON "_patologias_v" USING btree ("version_updated_at");
  CREATE INDEX "_patologias_v_version_version_created_at_idx" ON "_patologias_v" USING btree ("version_created_at");
  CREATE INDEX "_patologias_v_version_version__status_idx" ON "_patologias_v" USING btree ("version__status");
  CREATE INDEX "_patologias_v_created_at_idx" ON "_patologias_v" USING btree ("created_at");
  CREATE INDEX "_patologias_v_updated_at_idx" ON "_patologias_v" USING btree ("updated_at");
  CREATE INDEX "_patologias_v_snapshot_idx" ON "_patologias_v" USING btree ("snapshot");
  CREATE INDEX "_patologias_v_published_locale_idx" ON "_patologias_v" USING btree ("published_locale");
  CREATE INDEX "_patologias_v_latest_idx" ON "_patologias_v" USING btree ("latest");
  CREATE INDEX "maniobras_blocks_texto_order_idx" ON "maniobras_blocks_texto" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_texto_parent_id_idx" ON "maniobras_blocks_texto" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_texto_path_idx" ON "maniobras_blocks_texto" USING btree ("_path");
  CREATE INDEX "maniobras_blocks_lista_clinica_puntos_order_idx" ON "maniobras_blocks_lista_clinica_puntos" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_lista_clinica_puntos_parent_id_idx" ON "maniobras_blocks_lista_clinica_puntos" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_lista_clinica_order_idx" ON "maniobras_blocks_lista_clinica" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_lista_clinica_parent_id_idx" ON "maniobras_blocks_lista_clinica" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_lista_clinica_path_idx" ON "maniobras_blocks_lista_clinica" USING btree ("_path");
  CREATE INDEX "maniobras_blocks_tabla_clasificacion_filas_order_idx" ON "maniobras_blocks_tabla_clasificacion_filas" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_tabla_clasificacion_filas_parent_id_idx" ON "maniobras_blocks_tabla_clasificacion_filas" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_tabla_clasificacion_order_idx" ON "maniobras_blocks_tabla_clasificacion" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_tabla_clasificacion_parent_id_idx" ON "maniobras_blocks_tabla_clasificacion" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_tabla_clasificacion_path_idx" ON "maniobras_blocks_tabla_clasificacion" USING btree ("_path");
  CREATE INDEX "maniobras_blocks_advertencia_order_idx" ON "maniobras_blocks_advertencia" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_advertencia_parent_id_idx" ON "maniobras_blocks_advertencia" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_advertencia_path_idx" ON "maniobras_blocks_advertencia" USING btree ("_path");
  CREATE INDEX "maniobras_blocks_imagen_order_idx" ON "maniobras_blocks_imagen" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_imagen_parent_id_idx" ON "maniobras_blocks_imagen" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_imagen_path_idx" ON "maniobras_blocks_imagen" USING btree ("_path");
  CREATE INDEX "maniobras_blocks_imagen_imagen_idx" ON "maniobras_blocks_imagen" USING btree ("imagen_id");
  CREATE INDEX "maniobras_blocks_video_order_idx" ON "maniobras_blocks_video" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_video_parent_id_idx" ON "maniobras_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_video_path_idx" ON "maniobras_blocks_video" USING btree ("_path");
  CREATE INDEX "maniobras_blocks_video_video_idx" ON "maniobras_blocks_video" USING btree ("video_id");
  CREATE INDEX "maniobras_blocks_modelo_3d_order_idx" ON "maniobras_blocks_modelo_3d" USING btree ("_order");
  CREATE INDEX "maniobras_blocks_modelo_3d_parent_id_idx" ON "maniobras_blocks_modelo_3d" USING btree ("_parent_id");
  CREATE INDEX "maniobras_blocks_modelo_3d_path_idx" ON "maniobras_blocks_modelo_3d" USING btree ("_path");
  CREATE INDEX "maniobras_blocks_modelo_3d_modelo_idx" ON "maniobras_blocks_modelo_3d" USING btree ("modelo_id");
  CREATE INDEX "maniobras_segmento_idx" ON "maniobras" USING btree ("segmento_id");
  CREATE INDEX "maniobras_updated_at_idx" ON "maniobras" USING btree ("updated_at");
  CREATE INDEX "maniobras_created_at_idx" ON "maniobras" USING btree ("created_at");
  CREATE INDEX "maniobras__status_idx" ON "maniobras" USING btree ("_status");
  CREATE INDEX "_maniobras_v_blocks_texto_order_idx" ON "_maniobras_v_blocks_texto" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_texto_parent_id_idx" ON "_maniobras_v_blocks_texto" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_texto_path_idx" ON "_maniobras_v_blocks_texto" USING btree ("_path");
  CREATE INDEX "_maniobras_v_blocks_lista_clinica_puntos_order_idx" ON "_maniobras_v_blocks_lista_clinica_puntos" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_lista_clinica_puntos_parent_id_idx" ON "_maniobras_v_blocks_lista_clinica_puntos" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_lista_clinica_order_idx" ON "_maniobras_v_blocks_lista_clinica" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_lista_clinica_parent_id_idx" ON "_maniobras_v_blocks_lista_clinica" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_lista_clinica_path_idx" ON "_maniobras_v_blocks_lista_clinica" USING btree ("_path");
  CREATE INDEX "_maniobras_v_blocks_tabla_clasificacion_filas_order_idx" ON "_maniobras_v_blocks_tabla_clasificacion_filas" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_tabla_clasificacion_filas_parent_id_idx" ON "_maniobras_v_blocks_tabla_clasificacion_filas" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_tabla_clasificacion_order_idx" ON "_maniobras_v_blocks_tabla_clasificacion" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_tabla_clasificacion_parent_id_idx" ON "_maniobras_v_blocks_tabla_clasificacion" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_tabla_clasificacion_path_idx" ON "_maniobras_v_blocks_tabla_clasificacion" USING btree ("_path");
  CREATE INDEX "_maniobras_v_blocks_advertencia_order_idx" ON "_maniobras_v_blocks_advertencia" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_advertencia_parent_id_idx" ON "_maniobras_v_blocks_advertencia" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_advertencia_path_idx" ON "_maniobras_v_blocks_advertencia" USING btree ("_path");
  CREATE INDEX "_maniobras_v_blocks_imagen_order_idx" ON "_maniobras_v_blocks_imagen" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_imagen_parent_id_idx" ON "_maniobras_v_blocks_imagen" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_imagen_path_idx" ON "_maniobras_v_blocks_imagen" USING btree ("_path");
  CREATE INDEX "_maniobras_v_blocks_imagen_imagen_idx" ON "_maniobras_v_blocks_imagen" USING btree ("imagen_id");
  CREATE INDEX "_maniobras_v_blocks_video_order_idx" ON "_maniobras_v_blocks_video" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_video_parent_id_idx" ON "_maniobras_v_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_video_path_idx" ON "_maniobras_v_blocks_video" USING btree ("_path");
  CREATE INDEX "_maniobras_v_blocks_video_video_idx" ON "_maniobras_v_blocks_video" USING btree ("video_id");
  CREATE INDEX "_maniobras_v_blocks_modelo_3d_order_idx" ON "_maniobras_v_blocks_modelo_3d" USING btree ("_order");
  CREATE INDEX "_maniobras_v_blocks_modelo_3d_parent_id_idx" ON "_maniobras_v_blocks_modelo_3d" USING btree ("_parent_id");
  CREATE INDEX "_maniobras_v_blocks_modelo_3d_path_idx" ON "_maniobras_v_blocks_modelo_3d" USING btree ("_path");
  CREATE INDEX "_maniobras_v_blocks_modelo_3d_modelo_idx" ON "_maniobras_v_blocks_modelo_3d" USING btree ("modelo_id");
  CREATE INDEX "_maniobras_v_parent_idx" ON "_maniobras_v" USING btree ("parent_id");
  CREATE INDEX "_maniobras_v_version_version_segmento_idx" ON "_maniobras_v" USING btree ("version_segmento_id");
  CREATE INDEX "_maniobras_v_version_version_updated_at_idx" ON "_maniobras_v" USING btree ("version_updated_at");
  CREATE INDEX "_maniobras_v_version_version_created_at_idx" ON "_maniobras_v" USING btree ("version_created_at");
  CREATE INDEX "_maniobras_v_version_version__status_idx" ON "_maniobras_v" USING btree ("version__status");
  CREATE INDEX "_maniobras_v_created_at_idx" ON "_maniobras_v" USING btree ("created_at");
  CREATE INDEX "_maniobras_v_updated_at_idx" ON "_maniobras_v" USING btree ("updated_at");
  CREATE INDEX "_maniobras_v_snapshot_idx" ON "_maniobras_v" USING btree ("snapshot");
  CREATE INDEX "_maniobras_v_published_locale_idx" ON "_maniobras_v" USING btree ("published_locale");
  CREATE INDEX "_maniobras_v_latest_idx" ON "_maniobras_v" USING btree ("latest");
  CREATE INDEX "casos_ao_pasos_order_idx" ON "casos_ao_pasos" USING btree ("_order");
  CREATE INDEX "casos_ao_pasos_parent_id_idx" ON "casos_ao_pasos" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_pasos_modelo_idx" ON "casos_ao_pasos" USING btree ("modelo_id");
  CREATE INDEX "casos_ao_blocks_texto_order_idx" ON "casos_ao_blocks_texto" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_texto_parent_id_idx" ON "casos_ao_blocks_texto" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_texto_path_idx" ON "casos_ao_blocks_texto" USING btree ("_path");
  CREATE INDEX "casos_ao_blocks_lista_clinica_puntos_order_idx" ON "casos_ao_blocks_lista_clinica_puntos" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_lista_clinica_puntos_parent_id_idx" ON "casos_ao_blocks_lista_clinica_puntos" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_lista_clinica_order_idx" ON "casos_ao_blocks_lista_clinica" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_lista_clinica_parent_id_idx" ON "casos_ao_blocks_lista_clinica" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_lista_clinica_path_idx" ON "casos_ao_blocks_lista_clinica" USING btree ("_path");
  CREATE INDEX "casos_ao_blocks_tabla_clasificacion_filas_order_idx" ON "casos_ao_blocks_tabla_clasificacion_filas" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_tabla_clasificacion_filas_parent_id_idx" ON "casos_ao_blocks_tabla_clasificacion_filas" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_tabla_clasificacion_order_idx" ON "casos_ao_blocks_tabla_clasificacion" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_tabla_clasificacion_parent_id_idx" ON "casos_ao_blocks_tabla_clasificacion" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_tabla_clasificacion_path_idx" ON "casos_ao_blocks_tabla_clasificacion" USING btree ("_path");
  CREATE INDEX "casos_ao_blocks_advertencia_order_idx" ON "casos_ao_blocks_advertencia" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_advertencia_parent_id_idx" ON "casos_ao_blocks_advertencia" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_advertencia_path_idx" ON "casos_ao_blocks_advertencia" USING btree ("_path");
  CREATE INDEX "casos_ao_blocks_imagen_order_idx" ON "casos_ao_blocks_imagen" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_imagen_parent_id_idx" ON "casos_ao_blocks_imagen" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_imagen_path_idx" ON "casos_ao_blocks_imagen" USING btree ("_path");
  CREATE INDEX "casos_ao_blocks_imagen_imagen_idx" ON "casos_ao_blocks_imagen" USING btree ("imagen_id");
  CREATE INDEX "casos_ao_blocks_video_order_idx" ON "casos_ao_blocks_video" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_video_parent_id_idx" ON "casos_ao_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_video_path_idx" ON "casos_ao_blocks_video" USING btree ("_path");
  CREATE INDEX "casos_ao_blocks_video_video_idx" ON "casos_ao_blocks_video" USING btree ("video_id");
  CREATE INDEX "casos_ao_blocks_modelo_3d_order_idx" ON "casos_ao_blocks_modelo_3d" USING btree ("_order");
  CREATE INDEX "casos_ao_blocks_modelo_3d_parent_id_idx" ON "casos_ao_blocks_modelo_3d" USING btree ("_parent_id");
  CREATE INDEX "casos_ao_blocks_modelo_3d_path_idx" ON "casos_ao_blocks_modelo_3d" USING btree ("_path");
  CREATE INDEX "casos_ao_blocks_modelo_3d_modelo_idx" ON "casos_ao_blocks_modelo_3d" USING btree ("modelo_id");
  CREATE INDEX "casos_ao_updated_at_idx" ON "casos_ao" USING btree ("updated_at");
  CREATE INDEX "casos_ao_created_at_idx" ON "casos_ao" USING btree ("created_at");
  CREATE INDEX "casos_ao__status_idx" ON "casos_ao" USING btree ("_status");
  CREATE INDEX "_casos_ao_v_version_pasos_order_idx" ON "_casos_ao_v_version_pasos" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_version_pasos_parent_id_idx" ON "_casos_ao_v_version_pasos" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_version_pasos_modelo_idx" ON "_casos_ao_v_version_pasos" USING btree ("modelo_id");
  CREATE INDEX "_casos_ao_v_blocks_texto_order_idx" ON "_casos_ao_v_blocks_texto" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_texto_parent_id_idx" ON "_casos_ao_v_blocks_texto" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_texto_path_idx" ON "_casos_ao_v_blocks_texto" USING btree ("_path");
  CREATE INDEX "_casos_ao_v_blocks_lista_clinica_puntos_order_idx" ON "_casos_ao_v_blocks_lista_clinica_puntos" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_lista_clinica_puntos_parent_id_idx" ON "_casos_ao_v_blocks_lista_clinica_puntos" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_lista_clinica_order_idx" ON "_casos_ao_v_blocks_lista_clinica" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_lista_clinica_parent_id_idx" ON "_casos_ao_v_blocks_lista_clinica" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_lista_clinica_path_idx" ON "_casos_ao_v_blocks_lista_clinica" USING btree ("_path");
  CREATE INDEX "_casos_ao_v_blocks_tabla_clasificacion_filas_order_idx" ON "_casos_ao_v_blocks_tabla_clasificacion_filas" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_tabla_clasificacion_filas_parent_id_idx" ON "_casos_ao_v_blocks_tabla_clasificacion_filas" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_tabla_clasificacion_order_idx" ON "_casos_ao_v_blocks_tabla_clasificacion" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_tabla_clasificacion_parent_id_idx" ON "_casos_ao_v_blocks_tabla_clasificacion" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_tabla_clasificacion_path_idx" ON "_casos_ao_v_blocks_tabla_clasificacion" USING btree ("_path");
  CREATE INDEX "_casos_ao_v_blocks_advertencia_order_idx" ON "_casos_ao_v_blocks_advertencia" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_advertencia_parent_id_idx" ON "_casos_ao_v_blocks_advertencia" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_advertencia_path_idx" ON "_casos_ao_v_blocks_advertencia" USING btree ("_path");
  CREATE INDEX "_casos_ao_v_blocks_imagen_order_idx" ON "_casos_ao_v_blocks_imagen" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_imagen_parent_id_idx" ON "_casos_ao_v_blocks_imagen" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_imagen_path_idx" ON "_casos_ao_v_blocks_imagen" USING btree ("_path");
  CREATE INDEX "_casos_ao_v_blocks_imagen_imagen_idx" ON "_casos_ao_v_blocks_imagen" USING btree ("imagen_id");
  CREATE INDEX "_casos_ao_v_blocks_video_order_idx" ON "_casos_ao_v_blocks_video" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_video_parent_id_idx" ON "_casos_ao_v_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_video_path_idx" ON "_casos_ao_v_blocks_video" USING btree ("_path");
  CREATE INDEX "_casos_ao_v_blocks_video_video_idx" ON "_casos_ao_v_blocks_video" USING btree ("video_id");
  CREATE INDEX "_casos_ao_v_blocks_modelo_3d_order_idx" ON "_casos_ao_v_blocks_modelo_3d" USING btree ("_order");
  CREATE INDEX "_casos_ao_v_blocks_modelo_3d_parent_id_idx" ON "_casos_ao_v_blocks_modelo_3d" USING btree ("_parent_id");
  CREATE INDEX "_casos_ao_v_blocks_modelo_3d_path_idx" ON "_casos_ao_v_blocks_modelo_3d" USING btree ("_path");
  CREATE INDEX "_casos_ao_v_blocks_modelo_3d_modelo_idx" ON "_casos_ao_v_blocks_modelo_3d" USING btree ("modelo_id");
  CREATE INDEX "_casos_ao_v_parent_idx" ON "_casos_ao_v" USING btree ("parent_id");
  CREATE INDEX "_casos_ao_v_version_version_updated_at_idx" ON "_casos_ao_v" USING btree ("version_updated_at");
  CREATE INDEX "_casos_ao_v_version_version_created_at_idx" ON "_casos_ao_v" USING btree ("version_created_at");
  CREATE INDEX "_casos_ao_v_version_version__status_idx" ON "_casos_ao_v" USING btree ("version__status");
  CREATE INDEX "_casos_ao_v_created_at_idx" ON "_casos_ao_v" USING btree ("created_at");
  CREATE INDEX "_casos_ao_v_updated_at_idx" ON "_casos_ao_v" USING btree ("updated_at");
  CREATE INDEX "_casos_ao_v_snapshot_idx" ON "_casos_ao_v" USING btree ("snapshot");
  CREATE INDEX "_casos_ao_v_published_locale_idx" ON "_casos_ao_v" USING btree ("published_locale");
  CREATE INDEX "_casos_ao_v_latest_idx" ON "_casos_ao_v" USING btree ("latest");
  CREATE INDEX "cirugias_pasos_order_idx" ON "cirugias_pasos" USING btree ("_order");
  CREATE INDEX "cirugias_pasos_parent_id_idx" ON "cirugias_pasos" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_texto_order_idx" ON "cirugias_blocks_texto" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_texto_parent_id_idx" ON "cirugias_blocks_texto" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_texto_path_idx" ON "cirugias_blocks_texto" USING btree ("_path");
  CREATE INDEX "cirugias_blocks_lista_clinica_puntos_order_idx" ON "cirugias_blocks_lista_clinica_puntos" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_lista_clinica_puntos_parent_id_idx" ON "cirugias_blocks_lista_clinica_puntos" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_lista_clinica_order_idx" ON "cirugias_blocks_lista_clinica" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_lista_clinica_parent_id_idx" ON "cirugias_blocks_lista_clinica" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_lista_clinica_path_idx" ON "cirugias_blocks_lista_clinica" USING btree ("_path");
  CREATE INDEX "cirugias_blocks_tabla_clasificacion_filas_order_idx" ON "cirugias_blocks_tabla_clasificacion_filas" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_tabla_clasificacion_filas_parent_id_idx" ON "cirugias_blocks_tabla_clasificacion_filas" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_tabla_clasificacion_order_idx" ON "cirugias_blocks_tabla_clasificacion" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_tabla_clasificacion_parent_id_idx" ON "cirugias_blocks_tabla_clasificacion" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_tabla_clasificacion_path_idx" ON "cirugias_blocks_tabla_clasificacion" USING btree ("_path");
  CREATE INDEX "cirugias_blocks_advertencia_order_idx" ON "cirugias_blocks_advertencia" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_advertencia_parent_id_idx" ON "cirugias_blocks_advertencia" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_advertencia_path_idx" ON "cirugias_blocks_advertencia" USING btree ("_path");
  CREATE INDEX "cirugias_blocks_imagen_order_idx" ON "cirugias_blocks_imagen" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_imagen_parent_id_idx" ON "cirugias_blocks_imagen" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_imagen_path_idx" ON "cirugias_blocks_imagen" USING btree ("_path");
  CREATE INDEX "cirugias_blocks_imagen_imagen_idx" ON "cirugias_blocks_imagen" USING btree ("imagen_id");
  CREATE INDEX "cirugias_blocks_video_order_idx" ON "cirugias_blocks_video" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_video_parent_id_idx" ON "cirugias_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_video_path_idx" ON "cirugias_blocks_video" USING btree ("_path");
  CREATE INDEX "cirugias_blocks_video_video_idx" ON "cirugias_blocks_video" USING btree ("video_id");
  CREATE INDEX "cirugias_blocks_modelo_3d_order_idx" ON "cirugias_blocks_modelo_3d" USING btree ("_order");
  CREATE INDEX "cirugias_blocks_modelo_3d_parent_id_idx" ON "cirugias_blocks_modelo_3d" USING btree ("_parent_id");
  CREATE INDEX "cirugias_blocks_modelo_3d_path_idx" ON "cirugias_blocks_modelo_3d" USING btree ("_path");
  CREATE INDEX "cirugias_blocks_modelo_3d_modelo_idx" ON "cirugias_blocks_modelo_3d" USING btree ("modelo_id");
  CREATE INDEX "cirugias_updated_at_idx" ON "cirugias" USING btree ("updated_at");
  CREATE INDEX "cirugias_created_at_idx" ON "cirugias" USING btree ("created_at");
  CREATE INDEX "cirugias__status_idx" ON "cirugias" USING btree ("_status");
  CREATE INDEX "_cirugias_v_version_pasos_order_idx" ON "_cirugias_v_version_pasos" USING btree ("_order");
  CREATE INDEX "_cirugias_v_version_pasos_parent_id_idx" ON "_cirugias_v_version_pasos" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_texto_order_idx" ON "_cirugias_v_blocks_texto" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_texto_parent_id_idx" ON "_cirugias_v_blocks_texto" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_texto_path_idx" ON "_cirugias_v_blocks_texto" USING btree ("_path");
  CREATE INDEX "_cirugias_v_blocks_lista_clinica_puntos_order_idx" ON "_cirugias_v_blocks_lista_clinica_puntos" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_lista_clinica_puntos_parent_id_idx" ON "_cirugias_v_blocks_lista_clinica_puntos" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_lista_clinica_order_idx" ON "_cirugias_v_blocks_lista_clinica" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_lista_clinica_parent_id_idx" ON "_cirugias_v_blocks_lista_clinica" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_lista_clinica_path_idx" ON "_cirugias_v_blocks_lista_clinica" USING btree ("_path");
  CREATE INDEX "_cirugias_v_blocks_tabla_clasificacion_filas_order_idx" ON "_cirugias_v_blocks_tabla_clasificacion_filas" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_tabla_clasificacion_filas_parent_id_idx" ON "_cirugias_v_blocks_tabla_clasificacion_filas" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_tabla_clasificacion_order_idx" ON "_cirugias_v_blocks_tabla_clasificacion" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_tabla_clasificacion_parent_id_idx" ON "_cirugias_v_blocks_tabla_clasificacion" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_tabla_clasificacion_path_idx" ON "_cirugias_v_blocks_tabla_clasificacion" USING btree ("_path");
  CREATE INDEX "_cirugias_v_blocks_advertencia_order_idx" ON "_cirugias_v_blocks_advertencia" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_advertencia_parent_id_idx" ON "_cirugias_v_blocks_advertencia" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_advertencia_path_idx" ON "_cirugias_v_blocks_advertencia" USING btree ("_path");
  CREATE INDEX "_cirugias_v_blocks_imagen_order_idx" ON "_cirugias_v_blocks_imagen" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_imagen_parent_id_idx" ON "_cirugias_v_blocks_imagen" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_imagen_path_idx" ON "_cirugias_v_blocks_imagen" USING btree ("_path");
  CREATE INDEX "_cirugias_v_blocks_imagen_imagen_idx" ON "_cirugias_v_blocks_imagen" USING btree ("imagen_id");
  CREATE INDEX "_cirugias_v_blocks_video_order_idx" ON "_cirugias_v_blocks_video" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_video_parent_id_idx" ON "_cirugias_v_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_video_path_idx" ON "_cirugias_v_blocks_video" USING btree ("_path");
  CREATE INDEX "_cirugias_v_blocks_video_video_idx" ON "_cirugias_v_blocks_video" USING btree ("video_id");
  CREATE INDEX "_cirugias_v_blocks_modelo_3d_order_idx" ON "_cirugias_v_blocks_modelo_3d" USING btree ("_order");
  CREATE INDEX "_cirugias_v_blocks_modelo_3d_parent_id_idx" ON "_cirugias_v_blocks_modelo_3d" USING btree ("_parent_id");
  CREATE INDEX "_cirugias_v_blocks_modelo_3d_path_idx" ON "_cirugias_v_blocks_modelo_3d" USING btree ("_path");
  CREATE INDEX "_cirugias_v_blocks_modelo_3d_modelo_idx" ON "_cirugias_v_blocks_modelo_3d" USING btree ("modelo_id");
  CREATE INDEX "_cirugias_v_parent_idx" ON "_cirugias_v" USING btree ("parent_id");
  CREATE INDEX "_cirugias_v_version_version_updated_at_idx" ON "_cirugias_v" USING btree ("version_updated_at");
  CREATE INDEX "_cirugias_v_version_version_created_at_idx" ON "_cirugias_v" USING btree ("version_created_at");
  CREATE INDEX "_cirugias_v_version_version__status_idx" ON "_cirugias_v" USING btree ("version__status");
  CREATE INDEX "_cirugias_v_created_at_idx" ON "_cirugias_v" USING btree ("created_at");
  CREATE INDEX "_cirugias_v_updated_at_idx" ON "_cirugias_v" USING btree ("updated_at");
  CREATE INDEX "_cirugias_v_snapshot_idx" ON "_cirugias_v" USING btree ("snapshot");
  CREATE INDEX "_cirugias_v_published_locale_idx" ON "_cirugias_v" USING btree ("published_locale");
  CREATE INDEX "_cirugias_v_latest_idx" ON "_cirugias_v" USING btree ("latest");
  CREATE INDEX "estudios_ia_hallazgos_order_idx" ON "estudios_ia_hallazgos" USING btree ("_order");
  CREATE INDEX "estudios_ia_hallazgos_parent_id_idx" ON "estudios_ia_hallazgos" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_opciones_a_favor_order_idx" ON "estudios_ia_opciones_a_favor" USING btree ("_order");
  CREATE INDEX "estudios_ia_opciones_a_favor_parent_id_idx" ON "estudios_ia_opciones_a_favor" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_opciones_en_contra_order_idx" ON "estudios_ia_opciones_en_contra" USING btree ("_order");
  CREATE INDEX "estudios_ia_opciones_en_contra_parent_id_idx" ON "estudios_ia_opciones_en_contra" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_opciones_order_idx" ON "estudios_ia_opciones" USING btree ("_order");
  CREATE INDEX "estudios_ia_opciones_parent_id_idx" ON "estudios_ia_opciones" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_texto_order_idx" ON "estudios_ia_blocks_texto" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_texto_parent_id_idx" ON "estudios_ia_blocks_texto" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_texto_path_idx" ON "estudios_ia_blocks_texto" USING btree ("_path");
  CREATE INDEX "estudios_ia_blocks_lista_clinica_puntos_order_idx" ON "estudios_ia_blocks_lista_clinica_puntos" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_lista_clinica_puntos_parent_id_idx" ON "estudios_ia_blocks_lista_clinica_puntos" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_lista_clinica_order_idx" ON "estudios_ia_blocks_lista_clinica" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_lista_clinica_parent_id_idx" ON "estudios_ia_blocks_lista_clinica" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_lista_clinica_path_idx" ON "estudios_ia_blocks_lista_clinica" USING btree ("_path");
  CREATE INDEX "estudios_ia_blocks_tabla_clasificacion_filas_order_idx" ON "estudios_ia_blocks_tabla_clasificacion_filas" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_tabla_clasificacion_filas_parent_id_idx" ON "estudios_ia_blocks_tabla_clasificacion_filas" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_tabla_clasificacion_order_idx" ON "estudios_ia_blocks_tabla_clasificacion" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_tabla_clasificacion_parent_id_idx" ON "estudios_ia_blocks_tabla_clasificacion" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_tabla_clasificacion_path_idx" ON "estudios_ia_blocks_tabla_clasificacion" USING btree ("_path");
  CREATE INDEX "estudios_ia_blocks_advertencia_order_idx" ON "estudios_ia_blocks_advertencia" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_advertencia_parent_id_idx" ON "estudios_ia_blocks_advertencia" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_advertencia_path_idx" ON "estudios_ia_blocks_advertencia" USING btree ("_path");
  CREATE INDEX "estudios_ia_blocks_imagen_order_idx" ON "estudios_ia_blocks_imagen" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_imagen_parent_id_idx" ON "estudios_ia_blocks_imagen" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_imagen_path_idx" ON "estudios_ia_blocks_imagen" USING btree ("_path");
  CREATE INDEX "estudios_ia_blocks_imagen_imagen_idx" ON "estudios_ia_blocks_imagen" USING btree ("imagen_id");
  CREATE INDEX "estudios_ia_blocks_video_order_idx" ON "estudios_ia_blocks_video" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_video_parent_id_idx" ON "estudios_ia_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_video_path_idx" ON "estudios_ia_blocks_video" USING btree ("_path");
  CREATE INDEX "estudios_ia_blocks_video_video_idx" ON "estudios_ia_blocks_video" USING btree ("video_id");
  CREATE INDEX "estudios_ia_blocks_modelo_3d_order_idx" ON "estudios_ia_blocks_modelo_3d" USING btree ("_order");
  CREATE INDEX "estudios_ia_blocks_modelo_3d_parent_id_idx" ON "estudios_ia_blocks_modelo_3d" USING btree ("_parent_id");
  CREATE INDEX "estudios_ia_blocks_modelo_3d_path_idx" ON "estudios_ia_blocks_modelo_3d" USING btree ("_path");
  CREATE INDEX "estudios_ia_blocks_modelo_3d_modelo_idx" ON "estudios_ia_blocks_modelo_3d" USING btree ("modelo_id");
  CREATE INDEX "estudios_ia_updated_at_idx" ON "estudios_ia" USING btree ("updated_at");
  CREATE INDEX "estudios_ia_created_at_idx" ON "estudios_ia" USING btree ("created_at");
  CREATE INDEX "estudios_ia__status_idx" ON "estudios_ia" USING btree ("_status");
  CREATE INDEX "_estudios_ia_v_version_hallazgos_order_idx" ON "_estudios_ia_v_version_hallazgos" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_version_hallazgos_parent_id_idx" ON "_estudios_ia_v_version_hallazgos" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_version_opciones_a_favor_order_idx" ON "_estudios_ia_v_version_opciones_a_favor" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_version_opciones_a_favor_parent_id_idx" ON "_estudios_ia_v_version_opciones_a_favor" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_version_opciones_en_contra_order_idx" ON "_estudios_ia_v_version_opciones_en_contra" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_version_opciones_en_contra_parent_id_idx" ON "_estudios_ia_v_version_opciones_en_contra" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_version_opciones_order_idx" ON "_estudios_ia_v_version_opciones" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_version_opciones_parent_id_idx" ON "_estudios_ia_v_version_opciones" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_texto_order_idx" ON "_estudios_ia_v_blocks_texto" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_texto_parent_id_idx" ON "_estudios_ia_v_blocks_texto" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_texto_path_idx" ON "_estudios_ia_v_blocks_texto" USING btree ("_path");
  CREATE INDEX "_estudios_ia_v_blocks_lista_clinica_puntos_order_idx" ON "_estudios_ia_v_blocks_lista_clinica_puntos" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_lista_clinica_puntos_parent_id_idx" ON "_estudios_ia_v_blocks_lista_clinica_puntos" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_lista_clinica_order_idx" ON "_estudios_ia_v_blocks_lista_clinica" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_lista_clinica_parent_id_idx" ON "_estudios_ia_v_blocks_lista_clinica" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_lista_clinica_path_idx" ON "_estudios_ia_v_blocks_lista_clinica" USING btree ("_path");
  CREATE INDEX "_estudios_ia_v_blocks_tabla_clasificacion_filas_order_idx" ON "_estudios_ia_v_blocks_tabla_clasificacion_filas" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_tabla_clasificacion_filas_parent_id_idx" ON "_estudios_ia_v_blocks_tabla_clasificacion_filas" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_tabla_clasificacion_order_idx" ON "_estudios_ia_v_blocks_tabla_clasificacion" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_tabla_clasificacion_parent_id_idx" ON "_estudios_ia_v_blocks_tabla_clasificacion" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_tabla_clasificacion_path_idx" ON "_estudios_ia_v_blocks_tabla_clasificacion" USING btree ("_path");
  CREATE INDEX "_estudios_ia_v_blocks_advertencia_order_idx" ON "_estudios_ia_v_blocks_advertencia" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_advertencia_parent_id_idx" ON "_estudios_ia_v_blocks_advertencia" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_advertencia_path_idx" ON "_estudios_ia_v_blocks_advertencia" USING btree ("_path");
  CREATE INDEX "_estudios_ia_v_blocks_imagen_order_idx" ON "_estudios_ia_v_blocks_imagen" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_imagen_parent_id_idx" ON "_estudios_ia_v_blocks_imagen" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_imagen_path_idx" ON "_estudios_ia_v_blocks_imagen" USING btree ("_path");
  CREATE INDEX "_estudios_ia_v_blocks_imagen_imagen_idx" ON "_estudios_ia_v_blocks_imagen" USING btree ("imagen_id");
  CREATE INDEX "_estudios_ia_v_blocks_video_order_idx" ON "_estudios_ia_v_blocks_video" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_video_parent_id_idx" ON "_estudios_ia_v_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_video_path_idx" ON "_estudios_ia_v_blocks_video" USING btree ("_path");
  CREATE INDEX "_estudios_ia_v_blocks_video_video_idx" ON "_estudios_ia_v_blocks_video" USING btree ("video_id");
  CREATE INDEX "_estudios_ia_v_blocks_modelo_3d_order_idx" ON "_estudios_ia_v_blocks_modelo_3d" USING btree ("_order");
  CREATE INDEX "_estudios_ia_v_blocks_modelo_3d_parent_id_idx" ON "_estudios_ia_v_blocks_modelo_3d" USING btree ("_parent_id");
  CREATE INDEX "_estudios_ia_v_blocks_modelo_3d_path_idx" ON "_estudios_ia_v_blocks_modelo_3d" USING btree ("_path");
  CREATE INDEX "_estudios_ia_v_blocks_modelo_3d_modelo_idx" ON "_estudios_ia_v_blocks_modelo_3d" USING btree ("modelo_id");
  CREATE INDEX "_estudios_ia_v_parent_idx" ON "_estudios_ia_v" USING btree ("parent_id");
  CREATE INDEX "_estudios_ia_v_version_version_updated_at_idx" ON "_estudios_ia_v" USING btree ("version_updated_at");
  CREATE INDEX "_estudios_ia_v_version_version_created_at_idx" ON "_estudios_ia_v" USING btree ("version_created_at");
  CREATE INDEX "_estudios_ia_v_version_version__status_idx" ON "_estudios_ia_v" USING btree ("version__status");
  CREATE INDEX "_estudios_ia_v_created_at_idx" ON "_estudios_ia_v" USING btree ("created_at");
  CREATE INDEX "_estudios_ia_v_updated_at_idx" ON "_estudios_ia_v" USING btree ("updated_at");
  CREATE INDEX "_estudios_ia_v_snapshot_idx" ON "_estudios_ia_v" USING btree ("snapshot");
  CREATE INDEX "_estudios_ia_v_published_locale_idx" ON "_estudios_ia_v" USING btree ("published_locale");
  CREATE INDEX "_estudios_ia_v_latest_idx" ON "_estudios_ia_v" USING btree ("latest");
  CREATE INDEX "comentarios_usuario_idx" ON "comentarios" USING btree ("usuario_id");
  CREATE INDEX "comentarios_documento_id_idx" ON "comentarios" USING btree ("documento_id");
  CREATE INDEX "comentarios_updated_at_idx" ON "comentarios" USING btree ("updated_at");
  CREATE INDEX "comentarios_created_at_idx" ON "comentarios" USING btree ("created_at");
  CREATE INDEX "actividad_usuario_idx" ON "actividad" USING btree ("usuario_id");
  CREATE INDEX "actividad_documento_id_idx" ON "actividad" USING btree ("documento_id");
  CREATE INDEX "actividad_ultima_visita_idx" ON "actividad" USING btree ("ultima_visita");
  CREATE INDEX "actividad_updated_at_idx" ON "actividad" USING btree ("updated_at");
  CREATE INDEX "actividad_created_at_idx" ON "actividad" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_usuarios_id_idx" ON "payload_locked_documents_rels" USING btree ("usuarios_id");
  CREATE INDEX "payload_locked_documents_rels_segmentos_id_idx" ON "payload_locked_documents_rels" USING btree ("segmentos_id");
  CREATE INDEX "payload_locked_documents_rels_medios_id_idx" ON "payload_locked_documents_rels" USING btree ("medios_id");
  CREATE INDEX "payload_locked_documents_rels_modelos_3d_id_idx" ON "payload_locked_documents_rels" USING btree ("modelos_3d_id");
  CREATE INDEX "payload_locked_documents_rels_patologias_id_idx" ON "payload_locked_documents_rels" USING btree ("patologias_id");
  CREATE INDEX "payload_locked_documents_rels_maniobras_id_idx" ON "payload_locked_documents_rels" USING btree ("maniobras_id");
  CREATE INDEX "payload_locked_documents_rels_casos_ao_id_idx" ON "payload_locked_documents_rels" USING btree ("casos_ao_id");
  CREATE INDEX "payload_locked_documents_rels_cirugias_id_idx" ON "payload_locked_documents_rels" USING btree ("cirugias_id");
  CREATE INDEX "payload_locked_documents_rels_estudios_ia_id_idx" ON "payload_locked_documents_rels" USING btree ("estudios_ia_id");
  CREATE INDEX "payload_locked_documents_rels_comentarios_id_idx" ON "payload_locked_documents_rels" USING btree ("comentarios_id");
  CREATE INDEX "payload_locked_documents_rels_actividad_id_idx" ON "payload_locked_documents_rels" USING btree ("actividad_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_usuarios_id_idx" ON "payload_preferences_rels" USING btree ("usuarios_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "usuarios_modulos_visibles" CASCADE;
  DROP TABLE "usuarios_modulos_editables" CASCADE;
  DROP TABLE "usuarios_sessions" CASCADE;
  DROP TABLE "usuarios" CASCADE;
  DROP TABLE "segmentos" CASCADE;
  DROP TABLE "medios" CASCADE;
  DROP TABLE "modelos_3d" CASCADE;
  DROP TABLE "patologias_blocks_texto" CASCADE;
  DROP TABLE "patologias_blocks_lista_clinica_puntos" CASCADE;
  DROP TABLE "patologias_blocks_lista_clinica" CASCADE;
  DROP TABLE "patologias_blocks_tabla_clasificacion_filas" CASCADE;
  DROP TABLE "patologias_blocks_tabla_clasificacion" CASCADE;
  DROP TABLE "patologias_blocks_advertencia" CASCADE;
  DROP TABLE "patologias_blocks_imagen" CASCADE;
  DROP TABLE "patologias_blocks_video" CASCADE;
  DROP TABLE "patologias_blocks_modelo_3d" CASCADE;
  DROP TABLE "patologias_fases" CASCADE;
  DROP TABLE "patologias" CASCADE;
  DROP TABLE "_patologias_v_blocks_texto" CASCADE;
  DROP TABLE "_patologias_v_blocks_lista_clinica_puntos" CASCADE;
  DROP TABLE "_patologias_v_blocks_lista_clinica" CASCADE;
  DROP TABLE "_patologias_v_blocks_tabla_clasificacion_filas" CASCADE;
  DROP TABLE "_patologias_v_blocks_tabla_clasificacion" CASCADE;
  DROP TABLE "_patologias_v_blocks_advertencia" CASCADE;
  DROP TABLE "_patologias_v_blocks_imagen" CASCADE;
  DROP TABLE "_patologias_v_blocks_video" CASCADE;
  DROP TABLE "_patologias_v_blocks_modelo_3d" CASCADE;
  DROP TABLE "_patologias_v_version_fases" CASCADE;
  DROP TABLE "_patologias_v" CASCADE;
  DROP TABLE "maniobras_blocks_texto" CASCADE;
  DROP TABLE "maniobras_blocks_lista_clinica_puntos" CASCADE;
  DROP TABLE "maniobras_blocks_lista_clinica" CASCADE;
  DROP TABLE "maniobras_blocks_tabla_clasificacion_filas" CASCADE;
  DROP TABLE "maniobras_blocks_tabla_clasificacion" CASCADE;
  DROP TABLE "maniobras_blocks_advertencia" CASCADE;
  DROP TABLE "maniobras_blocks_imagen" CASCADE;
  DROP TABLE "maniobras_blocks_video" CASCADE;
  DROP TABLE "maniobras_blocks_modelo_3d" CASCADE;
  DROP TABLE "maniobras" CASCADE;
  DROP TABLE "_maniobras_v_blocks_texto" CASCADE;
  DROP TABLE "_maniobras_v_blocks_lista_clinica_puntos" CASCADE;
  DROP TABLE "_maniobras_v_blocks_lista_clinica" CASCADE;
  DROP TABLE "_maniobras_v_blocks_tabla_clasificacion_filas" CASCADE;
  DROP TABLE "_maniobras_v_blocks_tabla_clasificacion" CASCADE;
  DROP TABLE "_maniobras_v_blocks_advertencia" CASCADE;
  DROP TABLE "_maniobras_v_blocks_imagen" CASCADE;
  DROP TABLE "_maniobras_v_blocks_video" CASCADE;
  DROP TABLE "_maniobras_v_blocks_modelo_3d" CASCADE;
  DROP TABLE "_maniobras_v" CASCADE;
  DROP TABLE "casos_ao_pasos" CASCADE;
  DROP TABLE "casos_ao_blocks_texto" CASCADE;
  DROP TABLE "casos_ao_blocks_lista_clinica_puntos" CASCADE;
  DROP TABLE "casos_ao_blocks_lista_clinica" CASCADE;
  DROP TABLE "casos_ao_blocks_tabla_clasificacion_filas" CASCADE;
  DROP TABLE "casos_ao_blocks_tabla_clasificacion" CASCADE;
  DROP TABLE "casos_ao_blocks_advertencia" CASCADE;
  DROP TABLE "casos_ao_blocks_imagen" CASCADE;
  DROP TABLE "casos_ao_blocks_video" CASCADE;
  DROP TABLE "casos_ao_blocks_modelo_3d" CASCADE;
  DROP TABLE "casos_ao" CASCADE;
  DROP TABLE "_casos_ao_v_version_pasos" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_texto" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_lista_clinica_puntos" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_lista_clinica" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_tabla_clasificacion_filas" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_tabla_clasificacion" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_advertencia" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_imagen" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_video" CASCADE;
  DROP TABLE "_casos_ao_v_blocks_modelo_3d" CASCADE;
  DROP TABLE "_casos_ao_v" CASCADE;
  DROP TABLE "cirugias_pasos" CASCADE;
  DROP TABLE "cirugias_blocks_texto" CASCADE;
  DROP TABLE "cirugias_blocks_lista_clinica_puntos" CASCADE;
  DROP TABLE "cirugias_blocks_lista_clinica" CASCADE;
  DROP TABLE "cirugias_blocks_tabla_clasificacion_filas" CASCADE;
  DROP TABLE "cirugias_blocks_tabla_clasificacion" CASCADE;
  DROP TABLE "cirugias_blocks_advertencia" CASCADE;
  DROP TABLE "cirugias_blocks_imagen" CASCADE;
  DROP TABLE "cirugias_blocks_video" CASCADE;
  DROP TABLE "cirugias_blocks_modelo_3d" CASCADE;
  DROP TABLE "cirugias" CASCADE;
  DROP TABLE "_cirugias_v_version_pasos" CASCADE;
  DROP TABLE "_cirugias_v_blocks_texto" CASCADE;
  DROP TABLE "_cirugias_v_blocks_lista_clinica_puntos" CASCADE;
  DROP TABLE "_cirugias_v_blocks_lista_clinica" CASCADE;
  DROP TABLE "_cirugias_v_blocks_tabla_clasificacion_filas" CASCADE;
  DROP TABLE "_cirugias_v_blocks_tabla_clasificacion" CASCADE;
  DROP TABLE "_cirugias_v_blocks_advertencia" CASCADE;
  DROP TABLE "_cirugias_v_blocks_imagen" CASCADE;
  DROP TABLE "_cirugias_v_blocks_video" CASCADE;
  DROP TABLE "_cirugias_v_blocks_modelo_3d" CASCADE;
  DROP TABLE "_cirugias_v" CASCADE;
  DROP TABLE "estudios_ia_hallazgos" CASCADE;
  DROP TABLE "estudios_ia_opciones_a_favor" CASCADE;
  DROP TABLE "estudios_ia_opciones_en_contra" CASCADE;
  DROP TABLE "estudios_ia_opciones" CASCADE;
  DROP TABLE "estudios_ia_blocks_texto" CASCADE;
  DROP TABLE "estudios_ia_blocks_lista_clinica_puntos" CASCADE;
  DROP TABLE "estudios_ia_blocks_lista_clinica" CASCADE;
  DROP TABLE "estudios_ia_blocks_tabla_clasificacion_filas" CASCADE;
  DROP TABLE "estudios_ia_blocks_tabla_clasificacion" CASCADE;
  DROP TABLE "estudios_ia_blocks_advertencia" CASCADE;
  DROP TABLE "estudios_ia_blocks_imagen" CASCADE;
  DROP TABLE "estudios_ia_blocks_video" CASCADE;
  DROP TABLE "estudios_ia_blocks_modelo_3d" CASCADE;
  DROP TABLE "estudios_ia" CASCADE;
  DROP TABLE "_estudios_ia_v_version_hallazgos" CASCADE;
  DROP TABLE "_estudios_ia_v_version_opciones_a_favor" CASCADE;
  DROP TABLE "_estudios_ia_v_version_opciones_en_contra" CASCADE;
  DROP TABLE "_estudios_ia_v_version_opciones" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_texto" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_lista_clinica_puntos" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_lista_clinica" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_tabla_clasificacion_filas" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_tabla_clasificacion" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_advertencia" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_imagen" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_video" CASCADE;
  DROP TABLE "_estudios_ia_v_blocks_modelo_3d" CASCADE;
  DROP TABLE "_estudios_ia_v" CASCADE;
  DROP TABLE "comentarios" CASCADE;
  DROP TABLE "actividad" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_usuarios_modulos_visibles";
  DROP TYPE "public"."enum_usuarios_modulos_editables";
  DROP TYPE "public"."enum_usuarios_rol";
  DROP TYPE "public"."enum_modelos_3d_origen";
  DROP TYPE "public"."enum_patologias_blocks_advertencia_tono";
  DROP TYPE "public"."enum_patologias_blocks_imagen_ancho";
  DROP TYPE "public"."enum_patologias_tipo";
  DROP TYPE "public"."enum_patologias_status";
  DROP TYPE "public"."enum__patologias_v_blocks_advertencia_tono";
  DROP TYPE "public"."enum__patologias_v_blocks_imagen_ancho";
  DROP TYPE "public"."enum__patologias_v_version_tipo";
  DROP TYPE "public"."enum__patologias_v_version_status";
  DROP TYPE "public"."enum__patologias_v_published_locale";
  DROP TYPE "public"."enum_maniobras_blocks_advertencia_tono";
  DROP TYPE "public"."enum_maniobras_blocks_imagen_ancho";
  DROP TYPE "public"."enum_maniobras_status";
  DROP TYPE "public"."enum__maniobras_v_blocks_advertencia_tono";
  DROP TYPE "public"."enum__maniobras_v_blocks_imagen_ancho";
  DROP TYPE "public"."enum__maniobras_v_version_status";
  DROP TYPE "public"."enum__maniobras_v_published_locale";
  DROP TYPE "public"."enum_casos_ao_blocks_advertencia_tono";
  DROP TYPE "public"."enum_casos_ao_blocks_imagen_ancho";
  DROP TYPE "public"."enum_casos_ao_status";
  DROP TYPE "public"."enum__casos_ao_v_blocks_advertencia_tono";
  DROP TYPE "public"."enum__casos_ao_v_blocks_imagen_ancho";
  DROP TYPE "public"."enum__casos_ao_v_version_status";
  DROP TYPE "public"."enum__casos_ao_v_published_locale";
  DROP TYPE "public"."enum_cirugias_blocks_advertencia_tono";
  DROP TYPE "public"."enum_cirugias_blocks_imagen_ancho";
  DROP TYPE "public"."enum_cirugias_status";
  DROP TYPE "public"."enum__cirugias_v_blocks_advertencia_tono";
  DROP TYPE "public"."enum__cirugias_v_blocks_imagen_ancho";
  DROP TYPE "public"."enum__cirugias_v_version_status";
  DROP TYPE "public"."enum__cirugias_v_published_locale";
  DROP TYPE "public"."enum_estudios_ia_blocks_advertencia_tono";
  DROP TYPE "public"."enum_estudios_ia_blocks_imagen_ancho";
  DROP TYPE "public"."enum_estudios_ia_status";
  DROP TYPE "public"."enum__estudios_ia_v_blocks_advertencia_tono";
  DROP TYPE "public"."enum__estudios_ia_v_blocks_imagen_ancho";
  DROP TYPE "public"."enum__estudios_ia_v_version_status";
  DROP TYPE "public"."enum__estudios_ia_v_published_locale";
  DROP TYPE "public"."enum_comentarios_coleccion";
  DROP TYPE "public"."enum_comentarios_estado";
  DROP TYPE "public"."enum_actividad_coleccion";`)
}
