import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Quitar de la base el prefijo de la instalación (D-370, P-016 E1).
 *
 * Por qué. La base de ved va a copiarse a Contabo, que sirve la plataforma en la
 * raíz de `traumahub.cl` y no bajo `/traumahub`. Una base que guarda el prefijo
 * de quien la escribió dice cosas que en la otra instalación no existen. Una
 * base sin prefijo vale igual en las dos, y cada una lo pone al servir.
 *
 * Qué había el 2026-11-15, columna por columna, buscando `/traumahub`,
 * `tailc2094f` y `sslip.io` en todas las de texto y JSON de ved:
 *
 * - `modelos_3d.url`: 80 filas con prefijo y 2 sin él;
 * - `medios.url` y `medios.sizes_miniatura_url`: 1 fila con prefijo, de 3299;
 * - `tiempo_activo.ultima_ruta`: las 60 filas;
 * - nada más, ni con la dirección pública de ved ni con la de Contabo.
 *
 * Las direcciones de los archivos no se veían mal: Payload no usa lo guardado si
 * empieza por `/`, y lo rehace al leer con el prefijo de quien lee
 * (`generateFilePathOrURL`). Lo que sí se veía es la «Última página» de la
 * planilla de actividad.
 *
 * Cualquier prefijo y no solo `/traumahub`: desarrollo usa `/simulaciones`, y
 * una base puede llegar de cualquiera de las dos.
 * - En las direcciones se reconoce por lo que viene detrás,
 *   `/api/<colección>/file/<archivo>`, y se quita lo que haya delante. El
 *   nombre del archivo va con `encodeURIComponent`, así que no trae barras, y
 *   el patrón no puede comerse un trozo suyo.
 * - En la «Última página» no hay nada así detrás: cualquier ruta de la
 *   aplicación puede ir ahí. Se quitan los prefijos conocidos: el de esta
 *   instalación y los dos que han existido. Ninguno es el nombre de una página
 *   de la aplicación (`src/app/(frontend)`), así que no se confunde con una.
 *
 * Desde aquí en adelante no vuelve a entrar. El gancho de las subidas
 * (`src/collections/hooks/direccionSinPrefijo.ts`) y el latido
 * (`acciones/registro.ts`) guardan sin prefijo. `scripts/instrumental-a-sql.ts`
 * ya no lo acepta.
 *
 * No hay cambio de esquema. La instantánea que acompaña a este archivo es copia
 * de la de `20261115_004640_campo_quirurgico_y_tema`: `migrate:create` no
 * encuentra nada que diferenciar, y `tests/unit/migraciones.test.ts` lee la más
 * reciente.
 */

/** Las columnas que guardan la dirección de un archivo, con la colección que lo sirve. */
const DIRECCIONES = [
  { tabla: 'medios', columna: 'url', coleccion: 'medios' },
  { tabla: 'medios', columna: 'sizes_miniatura_url', coleccion: 'medios' },
  { tabla: 'medios', columna: 'sizes_ancho_url', coleccion: 'medios' },
  { tabla: 'medios_pagina', columna: 'url', coleccion: 'medios-pagina' },
  { tabla: 'modelos_3d', columna: 'url', coleccion: 'modelos-3d' },
] as const

/**
 * Los prefijos que puede traer la «Última página»: el de esta instalación y los
 * dos que han existido, `/traumahub` en ved y en Contabo y `/simulaciones` en
 * desarrollo y en el servidor de Windows.
 */
const prefijosConocidos = (): string[] => [
  ...new Set(
    [process.env.NEXT_BASE_PATH ?? '', process.env.NEXT_PUBLIC_BASE_PATH ?? '', '/traumahub', '/simulaciones']
      .map((p) => p.replace(/\/+$/, ''))
      .filter((p) => p.startsWith('/') && p.length > 1),
  ),
]

/**
 * Lo que haya antes de `/api/<colección>/file/`, fuera.
 *
 * Solo lo relativo (empieza por `/`) y con algo delante. Una dirección que ya
 * empieza por `/api/` no casa con el patrón y no se toca. Una absoluta
 * (`https://…`) tampoco: Payload la trataría como externa y la entregaría tal
 * cual, y el 2026-11-15 no había ninguna.
 */
const quitarDeLaDireccion = (tabla: string, columna: string, coleccion: string) => {
  const patron = `^/.+(/api/${coleccion}/file/[^/]*)$`
  const campo = sql.identifier(columna)
  return sql`
  UPDATE ${sql.identifier(tabla)}
     SET ${campo} = regexp_replace(${campo}, ${patron}, ${'\\1'})
   WHERE ${campo} ~ ${patron}
  RETURNING "id";`
}

/** El prefijo y su barra, fuera. Si la ruta es solo el prefijo, queda `/`. */
const quitarDeLaRuta = (prefijo: string) => sql`
  UPDATE "tiempo_activo"
     SET "ultima_ruta" = CASE
       WHEN "ultima_ruta" = ${prefijo} THEN '/'
       ELSE substr("ultima_ruta", ${prefijo.length + 1}::int)
     END
   WHERE "ultima_ruta" = ${prefijo}
      OR starts_with("ultima_ruta", ${`${prefijo}/`})
  RETURNING "id";`

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  const resumen: string[] = []
  for (const { tabla, columna, coleccion } of DIRECCIONES) {
    const { rows } = await db.execute(quitarDeLaDireccion(tabla, columna, coleccion))
    if (rows.length > 0) resumen.push(`${tabla}.${columna}: ${rows.length}`)
  }
  for (const prefijo of prefijosConocidos()) {
    const { rows } = await db.execute(quitarDeLaRuta(prefijo))
    if (rows.length > 0) resumen.push(`tiempo_activo.ultima_ruta (${prefijo}): ${rows.length}`)
  }
  payload.logger.info(
    resumen.length > 0
      ? `Sin prefijo en la base (D-370): ${resumen.join(', ')}.`
      : 'Sin prefijo en la base (D-370): ninguna fila lo llevaba.',
  )
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  // No se deshace. La base no guarda qué fila llevaba prefijo y cuál no (en ved
  // había de las dos formas), y volver a ponérselo a todas inventaría lo que no
  // hubo. Tampoco hace falta: Payload rehace al leer la dirección de cada
  // archivo con el prefijo de quien lee, y la «Última página» sin prefijo se
  // entiende igual.
  payload.logger.info('Sin prefijo en la base (D-370): no se revierte; ver la cabecera de la migración.')
}
