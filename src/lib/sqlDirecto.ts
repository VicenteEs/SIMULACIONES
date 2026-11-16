import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

/**
 * SQL a mano contra la base de Payload, dentro de la transacción de la
 * petición cuando la hay. Lo usan las piezas que hablan con la base sin pasar
 * por una colección: el catálogo de los modelos en uso (D-372) y lo que
 * comparten los procesos de la aplicación (D-393).
 */

export type Consulta = ReturnType<typeof sql>
export interface Ejecutor {
  execute: (consulta: Consulta) => Promise<{ rows: Record<string, unknown>[] }>
}
interface BaseConTransacciones extends Ejecutor {
  transaction: <T>(trabajo: (tx: Ejecutor) => Promise<T>) => Promise<T>
}
interface Adaptador {
  drizzle: BaseConTransacciones
  sessions?: Record<string | number, { db?: Ejecutor } | undefined>
  beginTransaction: () => Promise<null | number | string>
  commitTransaction: (id: number | string) => Promise<void>
  rollbackTransaction: (id: number | string) => Promise<void>
}

export const adaptadorDe = (payload: Payload): Adaptador => payload.db as unknown as Adaptador

/**
 * La conexión de la petición, si va dentro de una transacción.
 *
 * Es lo que hace `getTransaction` de `@payloadcms/drizzle`, que el paquete no
 * exporta. Importa en los ganchos: con otra conexión, una operación que en la
 * misma transacción hubiera cambiado una fila seguiría viéndola como estaba,
 * porque eso aún no está confirmado.
 */
export async function ejecutorDe(payload: Payload, req?: Partial<PayloadRequest>): Promise<Ejecutor> {
  const adaptador = adaptadorDe(payload)
  const transaccion = req?.transactionID ? await req.transactionID : undefined
  return (transaccion !== undefined && adaptador.sessions?.[transaccion]?.db) || adaptador.drizzle
}

/**
 * El espacio de los candados de la aplicación en `pg_advisory_xact_lock`, para
 * que un candado nuestro no choque con el de otro programa que use la misma
 * base con la forma de una sola llave.
 */
const ESPACIO_DE_CANDADOS = 20_161

/**
 * Corre `trabajo` con un candado de la base que nadie más con el mismo nombre
 * puede tener a la vez, en ningún proceso (D-393).
 *
 * Reemplaza las reservas en memoria que bastaban con un solo proceso: «una
 * difusión a la vez» o «los latidos de una cuenta, en fila». El candado es de
 * transacción (`pg_advisory_xact_lock`), así que se suelta solo al confirmar o
 * al deshacer, también si el proceso muere a la mitad; uno de sesión quedaría
 * tomado en una conexión del pool que vuelve a usarse para otra cosa.
 *
 * `trabajo` recibe la petición con la transacción puesta: lo que haga con la
 * API local pasándole ese `req` va dentro, y se confirma o se deshace junto.
 */
export async function conCandado<T>(
  payload: Payload,
  nombre: string,
  trabajo: (req: Partial<PayloadRequest>) => Promise<T>,
): Promise<T> {
  const adaptador = adaptadorDe(payload)
  const transaccion = await adaptador.beginTransaction()
  if (transaccion === null) throw new Error('La base no abrió una transacción para el candado.')
  const req = { payload, transactionID: transaccion } as Partial<PayloadRequest>
  try {
    const bd = await ejecutorDe(payload, req)
    await bd.execute(sql`select pg_advisory_xact_lock(${ESPACIO_DE_CANDADOS}::int, hashtext(${nombre}))`)
    const resultado = await trabajo(req)
    await adaptador.commitTransaction(transaccion)
    return resultado
  } catch (error) {
    await adaptador.rollbackTransaction(transaccion).catch(() => undefined)
    throw error
  }
}
