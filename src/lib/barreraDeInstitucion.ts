/**
 * La segunda barrera entre instituciones, en PostgreSQL (P-016 E5.4, D-396,
 * D-399).
 *
 * El filtro de `reglas.ts` cuida lo que se lee con `overrideAccess: false`. El
 * panel hace más de doscientas consultas con `overrideAccess: true`, y a
 * cualquiera de ellas se le puede olvidar el filtro de institución. Por eso la
 * base repite la regla por su cuenta: las políticas de seguridad por filas de la
 * migración `20261116_150000_barrera_de_instituciones` solo dejan ver, desde el
 * subdominio de una institución, lo suyo y lo central.
 *
 * Para eso la base tiene que saber dónde está cada consulta. Cada vez que la
 * aplicación toma una conexión del pool, aquí se le pone:
 *
 * - `traumahub.subdominio`, el de la petición en curso, que las políticas
 *   convierten en la institución;
 * - el rol `traumahub_app`, sin privilegios de superusuario. El usuario de la
 *   base de Docker es superusuario, y a un superusuario PostgreSQL no le aplica
 *   ninguna política: sin cambiar de rol, la barrera no existiría.
 *
 * Fuera de una petición —las migraciones, los guiones, la conservación diaria—
 * o en la central, la conexión vuelve a su usuario y no tiene barrera: ve todo,
 * como siempre.
 *
 * Solo se escribe a la base cuando la conexión cambia de lugar: lo que ya tiene
 * se apunta en la propia conexión. Con una sola institución en uso, casi nunca.
 */
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'
import { subdominioDeLasCabeceras } from './institucionesServidor'

/** El rol sin privilegios con el que corre una consulta hecha desde una institución. */
export const ROL_DE_INSTITUCION = 'traumahub_app'

/** La variable de la conexión que leen las políticas. */
export const VARIABLE_DEL_SUBDOMINIO = 'traumahub.subdominio'

/** Lo que se necesita de una conexión de `pg`. */
export interface ConexionDeLaBase {
  query: (texto: string, valores?: unknown[]) => Promise<unknown>
  release: (fallo?: Error | boolean) => void
}

/** Lo que se necesita del pool de `pg`: su `connect`, en las dos formas que tiene. */
export interface PoolDeLaBase {
  connect: {
    (): Promise<ConexionDeLaBase>
    (alTerminar: (fallo: Error | undefined, conexion?: ConexionDeLaBase, soltar?: (fallo?: Error) => void) => void): void
  }
}

/** Dónde se apunta, en la propia conexión, el lugar que ya tiene puesto. */
const LUGAR_PUESTO = Symbol('traumahub.lugarPuesto')

/** Para no envolver dos veces el mismo pool: Next recarga la configuración en desarrollo. */
const YA_ENVUELTO = Symbol('traumahub.barreraPuesta')

/**
 * El subdominio de la petición en curso, sacado del almacén de la petición que
 * Next mantiene para `headers()`. `''` si no hay petición, o si es la central.
 *
 * Es una pieza interna de Next (`workUnitAsyncStorage`): `headers()` no sirve
 * porque es asíncrona, y lanza fuera de una petición. Si una versión de Next la
 * quita, `tests/unit/barreraDeInstitucion.test.ts` falla antes de desplegar; si
 * la deja sin cabeceras, esto devuelve `''`, que es la central, sin barrera.
 * Por eso mismo hay una prueba de humo contra el servidor compilado (D-399).
 */
export function subdominioDeLaPeticionEnCurso(): string {
  const almacen = workUnitAsyncStorage.getStore() as { headers?: Pick<Headers, 'get'> } | undefined
  return almacen?.headers ? subdominioDeLasCabeceras(almacen.headers) : ''
}

/**
 * Corre `trabajo` como si no hubiera petición: las conexiones que pida salen
 * sin barrera, como las de un guion.
 *
 * Existe para una sola cosa, y conviene que siga así: borrar una cuenta desde
 * su institución (D-401). La anonimización de D-293 tiene que alcanzar lo que
 * la central anotó sobre ella —su alta como administradora de la institución,
 * las invitaciones—, y desde el subdominio la barrera no lo deja ver. Cada uso
 * nuevo es un agujero en la segunda barrera: que lo pida una decisión.
 *
 * Fuera de toda transacción de quien llama: la conexión es otra. Si `trabajo`
 * toca una fila que esa transacción ya tiene tomada, se esperan la una a la
 * otra para siempre.
 */
export function sinLaPeticion<T>(trabajo: () => Promise<T>): Promise<T> {
  return workUnitAsyncStorage.run(undefined as never, trabajo)
}

/**
 * Pone en una conexión el lugar pedido, si no lo tiene ya.
 *
 * `set_config(…, false)` dura lo que la conexión, no la transacción, y por eso
 * se puede apuntar en ella. Se pone fuera de toda transacción: es lo primero
 * que se hace al sacarla del pool.
 */
async function ponerLugar(conexion: ConexionDeLaBase, subdominio: string): Promise<void> {
  const marcada = conexion as ConexionDeLaBase & { [LUGAR_PUESTO]?: string }
  if ((marcada[LUGAR_PUESTO] ?? '') === subdominio) return
  await conexion.query(`SELECT set_config($1, $2, false), set_config('role', $3, false)`, [
    VARIABLE_DEL_SUBDOMINIO,
    subdominio,
    subdominio ? ROL_DE_INSTITUCION : 'none',
  ])
  marcada[LUGAR_PUESTO] = subdominio
}

/**
 * Envuelve el `connect` del pool para que toda conexión salga con el lugar de
 * la petición en curso.
 *
 * Se envuelve `connect` y no `query`: `pool.query` de `pg` pasa por
 * `this.connect`, y las transacciones de Payload lo llaman directamente, así
 * que por aquí pasan las dos. El lugar se lee al llamar, no al recibir la
 * conexión: si hay que esperar a que se libere una, la espera ya no corre
 * dentro de la petición.
 *
 * Si poner el lugar falla, la conexión se descarta y la consulta falla con
 * ella. Una consulta de una institución que corriera sin barrera es justo lo
 * que esto existe para impedir.
 */
export function ponerBarrera(pool: PoolDeLaBase, leerSubdominio: () => string = subdominioDeLaPeticionEnCurso): void {
  const envuelto = pool as PoolDeLaBase & { [YA_ENVUELTO]?: true }
  if (envuelto[YA_ENVUELTO]) return
  const original = pool.connect.bind(pool) as () => Promise<ConexionDeLaBase>

  const conectar = (alTerminar?: (fallo: Error | undefined, conexion?: ConexionDeLaBase, soltar?: (fallo?: Error) => void) => void) => {
    const subdominio = leerSubdominio()
    const lista = original().then(async (conexion) => {
      try {
        await ponerLugar(conexion, subdominio)
      } catch (fallo) {
        // `true` la destruye en vez de devolverla: no se sabe en qué estado quedó.
        conexion.release(true)
        throw fallo
      }
      return conexion
    })
    if (!alTerminar) return lista
    lista.then(
      (conexion) => alTerminar(undefined, conexion, (fallo?: Error) => conexion.release(fallo)),
      (fallo: Error) => alTerminar(fallo),
    )
    return undefined
  }

  pool.connect = conectar as PoolDeLaBase['connect']
  envuelto[YA_ENVUELTO] = true
}

/**
 * La pone en el pool de Payload, si la base la tiene: el rol existe y quien se
 * conecta puede tomarlo. En desarrollo no, porque allí manda el `push` de
 * Drizzle, que no aplica migraciones (`payload.config.ts`); se dice una vez al
 * arrancar, y la plataforma sigue funcionando sin la barrera.
 */
export async function ponerBarreraEnPayload(payload: {
  db: unknown
  logger: { info: (m: string) => void; warn: (m: string) => void }
}): Promise<boolean> {
  const pool = (payload.db as { pool?: PoolDeLaBase & { query?: (t: string, v?: unknown[]) => Promise<{ rows: { puede: boolean }[] }> } }).pool
  if (!pool?.query) return false
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
        AND pg_has_role(current_user, $1, 'MEMBER') AS puede`,
    [ROL_DE_INSTITUCION],
  )
  if (!rows[0]?.puede) {
    payload.logger.warn(
      `Sin la segunda barrera entre instituciones: la base no tiene el rol ${ROL_DE_INSTITUCION}. ` +
        'En desarrollo es lo normal (el esquema lo pone el push); en el servidor, faltan las migraciones.',
    )
    return false
  }
  ponerBarrera(pool)
  payload.logger.info('La segunda barrera entre instituciones está puesta en el pool de la base (D-399).')
  return true
}
