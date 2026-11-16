import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  timestamp,
  varchar,
} from '@payloadcms/db-postgres/drizzle/pg-core'
import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'

type GanchoDeEsquema = NonNullable<PostgresAdapterArgs['beforeSchemaInit']>[number]

/**
 * Las tablas que comparten los procesos de la aplicación (D-393).
 *
 * Hasta D-392 la aplicación corría en un solo proceso de Node, y cuatro cosas
 * vivían en su memoria: el freno de intentos (`ritmo.ts`), quién tiene abierta
 * cada ficha en el editor (`presencia.ts`), la cuenta de publicaciones que
 * escucha `/api/cambios` (`publicaciones.ts`) y la cola de latidos de revisión
 * (`revisionServidor.ts`). Con varios procesos, cada uno vería solo lo suyo: el
 * freno dejaría pasar N veces más intentos, la banda del editor diría la mitad y
 * una publicación solo la anunciaría el proceso que la atendió. Por eso pasan a
 * la base.
 *
 * Son tablas y no colecciones de Payload a propósito. Una colección se sirve por
 * la API, entra en la matriz de roles, en el registro de acciones y en el ensayo
 * de los casos, y nada de eso tiene sentido para filas que viven segundos. Pero
 * tampoco pueden ser tablas que Payload no conozca: en desarrollo el `push` de
 * Drizzle borraría lo que no está en su esquema, y antes de hacerlo pregunta
 * por consola, que es colgar el servidor sin decir nada (D-056). Declaradas
 * aquí, entran en el esquema de Drizzle, en el `push` y en `migrate:create`
 * como cualquier otra.
 */

/**
 * Un intento que el freno dejó pasar. Los rechazados no se anotan, así que la
 * tabla crece solo con lo permitido, y lo que pasa de una hora se borra.
 *
 * `clave` no es la IP ni el correo de quien lo intentó, sino su huella
 * (`ritmo.ts`): el freno solo necesita saber si dos intentos son del mismo, y
 * así la tabla —y cada respaldo que la copie— no guarda datos personales.
 */
export const intentos = pgTable(
  'intentos',
  {
    id: serial('id').primaryKey(),
    freno: varchar('freno').notNull(),
    clave: varchar('clave').notNull(),
    instante: timestamp('instante', { withTimezone: true, precision: 3, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('intentos_freno_clave_instante_idx').on(t.freno, t.clave, t.instante), index('intentos_instante_idx').on(t.instante)],
)

/**
 * Una pestaña del editor con una ficha abierta. Caduca a los segundos de su
 * último latido (`presencia.ts`), y la limpieza la borra.
 *
 * Guarda la cuenta y no su nombre: el nombre se lee de `usuarios` al preguntar,
 * así que una cuenta borrada desaparece de la banda en el acto.
 */
export const presencias = pgTable(
  'presencias',
  {
    ficha: varchar('ficha').notNull(),
    usuario: integer('usuario').notNull(),
    pestana: varchar('pestana').notNull(),
    visible: boolean('visible').notNull(),
    desde: timestamp('desde', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
    visto: timestamp('visto', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.ficha, t.usuario, t.pestana] }), index('presencias_visto_idx').on(t.visto)],
)

/**
 * La última publicación de cada módulo. `version` son los milisegundos del
 * instante en que se publicó: crece sola, la comparten todos los procesos y
 * sobrevive a un reinicio, que es lo que el contador en memoria no podía.
 */
export const publicaciones = pgTable('publicaciones', {
  modulo: varchar('modulo').primaryKey(),
  version: bigint('version', { mode: 'number' }).notNull(),
  titulo: varchar('titulo').notNull(),
})

/** Lo que `payload.config.ts` le pasa al adaptador. */
export const agregarTablasInternas: GanchoDeEsquema = ({ schema }) => ({
  ...schema,
  tables: { ...schema.tables, intentos, presencias, publicaciones },
})
