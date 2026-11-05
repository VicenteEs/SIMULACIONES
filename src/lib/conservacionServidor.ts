/**
 * Los plazos de `conservacion.ts`, aplicados a la base (D-290).
 *
 * Tres cosas, y las tres son la misma promesa del aviso de privacidad vista
 * desde la base:
 *
 *  1. **Lo vencido se borra**: las entradas del registro de acciones y las
 *     cotizaciones de más de doce meses.
 *  2. **Lo que deja una cuenta al eliminarla pierde el nombre y el correo**
 *     (D-291): sus entradas del registro siguen diciendo qué se hizo, pero ya no
 *     de quién. Lo mismo las que la nombran —«cambió los permisos de Fulana»— y
 *     los envíos fallidos de una difusión, que guardan la dirección.
 *  3. **Lo de una cotización tampoco queda en el registro con el nombre de
 *     quien la pidió**: la entrada se titula con la institución.
 *
 * El 2 se hace en el momento, dentro del borrado de la cuenta
 * (`anonimizarElRastroDeLaCuenta`, desde `Usuarios.ts`). Además, cada día, la
 * pasada de `aplicarLaConservacion` repite el 2 y el 3 sobre toda la base
 * (`anonimizarLoDeCuentasBorradas`), y eso no es redundancia: alcanza lo que se
 * borró antes de que existiera esta regla, lo que borre un guion sin pasar por
 * el gancho y lo que vuelva con un respaldo restaurado. Es idempotente: sobre
 * una base ya limpia no toca ninguna fila.
 *
 * Todo con la capa de la base (`payload.db`) y no con las operaciones de
 * Payload. `payload.update` con un `where` lee cada fila, la valida y le pasa
 * los ganchos, una por una: para las miles de lecturas que deja un residente en
 * un año, eso es un borrado de cuenta de minutos con la transacción abierta. Lo
 * que aquí se escribe no necesita ganchos —el registro no se anota a sí mismo
 * (`COLECCIONES_SIN_REGISTRO`)—, y `db.deleteMany` es un solo `DELETE`. La
 * excepción son las cotizaciones y las difusiones, que sí pasan por
 * `payload.delete` y `payload.update`: son pocas, y su borrado tiene que
 * llevarse lo que Payload cuelga de cada fila (bloqueos, preferencias).
 *
 * Se les pasa `sinRegistro` a propósito. Sin él, el gancho del registro anotaría
 * cada cotización vencida con su título y cada difusión retocada con su asunto:
 * la limpieza dejaría un rastro nuevo de lo que acaba de limpiar. La pasada
 * anota una sola línea con el resumen, como hace la importación de libros.
 */
import type { Payload, PayloadRequest, Where } from 'payload'
import { MESES_DE_LAS_COTIZACIONES, MESES_DEL_REGISTRO_DE_ACCIONES, plazoEnPalabras, vencimiento } from './conservacion'
import { registrarAccion } from './registroServidor'

type Peticion = Partial<PayloadRequest> | undefined
type Registro = Record<string, unknown>

/** Lo que se pone donde estaba la dirección en el motivo de un envío fallido. */
export const CORREO_RETIRADO = '[cuenta eliminada]'

const SIN_REGISTRO = { sinRegistro: true }

const contar = async (payload: Payload, where: Where, req: Peticion): Promise<number> =>
  (
    await payload.count({
      collection: 'registro-de-acciones',
      where,
      overrideAccess: true,
      ...(req ? { req: req as PayloadRequest } : {}),
    })
  ).totalDocs

/**
 * Escribe `data` en las filas del registro que casan con `where`, y dice
 * cuántas eran. Se cuenta antes porque `db.updateMany` sin `returning` no
 * devuelve nada, y pedirle que devuelva las filas sería leerlas todas otra vez.
 */
async function retocarElRegistro(payload: Payload, where: Where, data: Registro, req: Peticion): Promise<number> {
  const filas = await contar(payload, where, req)
  if (filas === 0) return 0
  await payload.db.updateMany({
    collection: 'registro-de-acciones',
    where,
    data,
    returning: false,
    ...(req ? { req } : {}),
  })
  return filas
}

// ---------------------------------------------------------------- correos

const escaparRegex = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * El motivo de un envío fallido sin la dirección dentro. Los servidores de
 * correo la repiten en su respuesta —«550 5.1.1 <fulana@hospital.cl>: Recipient
 * address rejected»—, así que quitarla solo del campo `correo` dejaba la misma
 * dirección dos palabras más abajo.
 */
export function motivoSinCorreo(motivo: unknown, correo: string): unknown {
  if (typeof motivo !== 'string' || !correo) return motivo
  return motivo.replace(new RegExp(escaparRegex(correo), 'gi'), CORREO_RETIRADO)
}

interface FalloDeEnvio {
  correo?: unknown
  motivo?: unknown
}

/**
 * Los fallos de una difusión con las direcciones que `retirar` señala ya
 * quitadas, o `null` si no había ninguna que quitar. Puro, para probarlo sin
 * base: el envío fallido sigue contando —el número de `fallidos` no se mueve—,
 * solo deja de decir a quién.
 */
export function fallosSinCorreos(fallos: unknown, retirar: (correo: string) => boolean): FalloDeEnvio[] | null {
  if (!Array.isArray(fallos)) return null
  let cambio = false
  const limpios = fallos.map((fallo: FalloDeEnvio) => {
    const correo = typeof fallo?.correo === 'string' ? fallo.correo : ''
    if (!correo || !retirar(correo)) return fallo
    cambio = true
    return { ...fallo, correo: null, motivo: motivoSinCorreo(fallo.motivo, correo) }
  })
  return cambio ? limpios : null
}

/**
 * Quita de los envíos fallidos de las difusiones las direcciones que `retirar`
 * señala. Las difusiones son pocas —una por anuncio— y se leen enteras: buscar
 * dentro de un JSON con `where` depende de cómo lo guarde cada base, y aquí no
 * hace falta.
 *
 * Se escribe con `db.updateOne` y no con `payload.update` + `sinRegistro`, que
 * sería lo natural, por una razón que no se ve: con el `req` del borrado, Payload
 * **mezcla** el `context` que se le pasa en el `req.context` compartido
 * (`getRequestContext`, en `createLocalReq`) y no lo quita al terminar. El
 * `sinRegistro` de la difusión se quedaba puesto para el resto de la petición,
 * y el «Eliminó» de la propia cuenta —que se anota después, en su
 * `afterDelete`— ya no se anotaba. La capa de la base no corre ganchos, así que
 * no hay nada que silenciar.
 */
async function retirarCorreosDeLasDifusiones(
  payload: Payload,
  retirar: (correo: string) => boolean,
  req: Peticion,
): Promise<number> {
  const { docs } = await payload.find({
    collection: 'difusiones',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { fallos: true },
    ...(req ? { req: req as PayloadRequest } : {}),
  })
  let retocadas = 0
  for (const difusion of docs as unknown as Registro[]) {
    const fallos = fallosSinCorreos(difusion.fallos, retirar)
    if (!fallos) continue
    await payload.db.updateOne({
      collection: 'difusiones',
      id: difusion.id as number,
      data: { fallos },
      returning: false,
      ...(req ? { req } : {}),
    })
    retocadas += 1
  }
  return retocadas
}

// ------------------------------------------------------------ preferencias

const preferenciasDe = (id: string): Where => ({
  and: [{ 'user.value': { equals: id } }, { 'user.relationTo': { equals: 'usuarios' } }],
})

/**
 * Borra las preferencias de pantalla que la cuenta guardó en el servidor, y
 * dice cuántas eran.
 *
 * Payload las borra por su cuenta al eliminar una cuenta
 * (`deleteUserPreferences`), pero después de borrar la fila (`deleteByID.js`), y
 * para entonces el `ON DELETE CASCADE` de `payload_preferences_rels` ya se llevó
 * el vínculo por el que las busca: no encuentra ninguna, y se quedaban en la base
 * para siempre, sin dueño y con su contenido. Lo destapó
 * `tests/integration/privacidad.test.ts`. Aquí se borran antes, dentro de la
 * transacción del borrado.
 */
async function borrarPreferenciasDe(payload: Payload, id: string, req: Peticion): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'payload-preferences',
    where: preferenciasDe(id),
    overrideAccess: true,
    ...(req ? { req: req as PayloadRequest } : {}),
  })
  if (totalDocs === 0) return 0
  await payload.db.deleteMany({ collection: 'payload-preferences', where: preferenciasDe(id), ...(req ? { req } : {}) })
  return totalDocs
}

/**
 * Las preferencias que ya quedaron sin dueño por lo de arriba, de las cuentas
 * borradas antes del arreglo. Son pocas —el panel de Payload que las escribía se
 * retiró (D-038)—, y se leen todas: una fila cuyo vínculo con la cuenta
 * desapareció es justo la que no se deja encontrar con un `where`.
 */
async function borrarPreferenciasHuerfanas(payload: Payload, req: Peticion): Promise<number> {
  const { docs } = await payload.find({
    collection: 'payload-preferences',
    pagination: false,
    depth: 0,
    overrideAccess: true,
    ...(req ? { req: req as PayloadRequest } : {}),
  })
  const huerfanas = (docs as unknown as Registro[])
    .filter((p) => {
      const dueno = p.user as { value?: unknown } | null | undefined
      return !dueno || dueno.value === null || dueno.value === undefined
    })
    .map((p) => p.id as number)
  if (huerfanas.length === 0) return 0
  await payload.db.deleteMany({ collection: 'payload-preferences', where: { id: { in: huerfanas } }, ...(req ? { req } : {}) })
  return huerfanas.length
}

// ------------------------------------------------- al eliminar una cuenta

export interface RastroAnonimizado {
  /** Entradas del registro que hizo la cuenta, ya sin su nombre ni su correo. */
  propias: number
  /** Entradas que la nombraban en su título —su alta, sus cambios de permisos—. */
  sobreElla: number
  /** Difusiones cuyos envíos fallidos guardaban su dirección. */
  difusiones: number
  /** Preferencias de pantalla de la cuenta, borradas antes de que la base suelte el vínculo. */
  preferencias: number
}

/**
 * Lo que la cuenta deja en el registro y en las difusiones, sin su nombre ni su
 * correo (D-291). Se llama desde el `beforeDelete` de `Usuarios.ts`, con su
 * `req`, para que entre en la transacción del borrado: si el borrado se
 * deshace, la anonimización se deshace con él, y la cuenta que sigue viva
 * conserva su registro con nombre.
 *
 * Vale igual para eliminar una cuenta y para rechazar una solicitud, porque las
 * dos acaban en el mismo `payload.delete` (`borrarCuentaVigilada`).
 *
 * Lo que se conserva de cada entrada es el acto: cuándo, qué, sobre qué
 * documento, y el rol y los módulos que tenía la cuenta en ese momento. El rol
 * se queda porque sin él el registro no explica lo que se pudo hacer; un
 * «lector leyó la ficha X» no dice de quién.
 */
export async function anonimizarElRastroDeLaCuenta(
  payload: Payload,
  cuenta: { id: string | number; email?: unknown },
  req: Peticion,
): Promise<RastroAnonimizado> {
  const id = String(cuenta.id)
  const propias = await retocarElRegistro(
    payload,
    {
      and: [
        { usuario: { equals: id } },
        { or: [{ usuarioNombre: { exists: true } }, { usuarioCorreo: { exists: true } }] },
      ],
    },
    { usuarioNombre: null, usuarioCorreo: null },
    req,
  )
  const sobreElla = await retocarElRegistro(
    payload,
    { and: [{ coleccion: { equals: 'usuarios' } }, { documentoId: { equals: id } }, { titulo: { exists: true } }] },
    { titulo: null },
    req,
  )
  const correo = typeof cuenta.email === 'string' ? cuenta.email.trim().toLowerCase() : ''
  const difusiones = correo
    ? await retirarCorreosDeLasDifusiones(payload, (c) => c.trim().toLowerCase() === correo, req)
    : 0
  const preferencias = await borrarPreferenciasDe(payload, id, req)
  return { propias, sobreElla, difusiones, preferencias }
}

// ------------------------------------------------- la pasada de cada día

export interface ResultadoDeLaConservacion {
  /** Entradas del registro borradas por tener más del plazo. */
  accionesVencidas: number
  /** Cotizaciones borradas por tener más del plazo. */
  cotizacionesVencidas: number
  /** Entradas de cuentas ya borradas que todavía tenían nombre o correo. */
  accionesAnonimizadas: number
  /** Entradas cuyo título nombraba a una cuenta ya borrada o a quien pidió una cotización. */
  titulosRetirados: number
  /** Difusiones cuyos envíos fallidos guardaban la dirección de una cuenta ya borrada. */
  difusionesRetocadas: number
  /** Preferencias de pantalla que quedaron sin dueño al borrar su cuenta. */
  preferenciasHuerfanas: number
}

/**
 * Borra del registro y de las cotizaciones lo que pasó su plazo.
 *
 * El registro, con un `DELETE` directo: no tiene ganchos ni nada colgado. Las
 * cotizaciones, con `payload.delete`: además de su fila, Payload borra la tabla
 * de sus módulos, los bloqueos y las preferencias que cuelgan de cada una.
 */
async function borrarLoVencido(payload: Payload, ahora: Date) {
  const dondeVencidas: Where = {
    fecha: { less_than: vencimiento(MESES_DEL_REGISTRO_DE_ACCIONES, ahora).toISOString() },
  }
  const accionesVencidas = await contar(payload, dondeVencidas, undefined)
  if (accionesVencidas > 0) {
    await payload.db.deleteMany({ collection: 'registro-de-acciones', where: dondeVencidas })
  }

  const { docs, errors } = await payload.delete({
    collection: 'cotizaciones',
    where: { createdAt: { less_than: vencimiento(MESES_DE_LAS_COTIZACIONES, ahora).toISOString() } },
    overrideAccess: true,
    depth: 0,
    context: SIN_REGISTRO,
  })
  if (errors.length > 0) {
    payload.logger.error({ msg: 'No se pudieron borrar algunas cotizaciones vencidas', errors })
  }
  return { accionesVencidas, cotizacionesVencidas: docs.length }
}

const filasVivasDe = async (payload: Payload, collection: 'usuarios' | 'cotizaciones', req: Peticion) =>
  (
    await payload.find({
      collection,
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: collection === 'usuarios' ? { email: true } : { institucion: true },
      ...(req ? { req: req as PayloadRequest } : {}),
    })
  ).docs as unknown as Registro[]

/**
 * Las entradas que nombran a una cuenta o a una cotización que ya no existen.
 *
 * Con `not_in` sobre los identificadores vivos, que son pocos —decenas de
 * cuentas—, y no al revés: la base no guarda cuáles se borraron. Si no queda
 * ninguna viva, la condición sobra: no se puede escribir `NOT IN ()`.
 */
const queNombranA = (coleccion: string, vivas: Registro[]): Where => ({
  and: [
    { coleccion: { equals: coleccion } },
    { titulo: { exists: true } },
    ...(vivas.length > 0 ? [{ documentoId: { not_in: vivas.map((v) => String(v.id)) } }] : []),
  ],
})

/**
 * La misma regla del borrado de cuentas, sobre toda la base.
 *
 * Una entrada de una cuenta borrada se reconoce sin saber cuál era: la base
 * dejó `usuario` a nulo al borrarla (`ON DELETE SET NULL`), y una entrada sin
 * cuenta que no sea de una cuenta borrada lleva siempre su `origen` —«sistema»,
 * «importación»—, porque `registrarAccion` lo pone en cuanto no hay cuenta.
 */
export async function anonimizarLoDeCuentasBorradas(payload: Payload, req?: Peticion) {
  const accionesAnonimizadas = await retocarElRegistro(
    payload,
    {
      and: [
        { usuario: { exists: false } },
        { origen: { exists: false } },
        { or: [{ usuarioNombre: { exists: true } }, { usuarioCorreo: { exists: true } }] },
      ],
    },
    { usuarioNombre: null, usuarioCorreo: null },
    req,
  )

  const cuentas = await filasVivasDe(payload, 'usuarios', req)
  let titulosRetirados = await retocarElRegistro(payload, queNombranA('usuarios', cuentas), { titulo: null }, req)

  // Las cotizaciones se anotaban con el nombre de quien la pidió, que es el
  // primer campo que `titulo()` encuentra (`hooks/registrarAccion.ts`). Desde
  // D-291 se anotan con la institución; las de antes se corrigen aquí, y las de
  // una cotización ya borrada se quedan sin título.
  const cotizaciones = await filasVivasDe(payload, 'cotizaciones', req)
  titulosRetirados += await retocarElRegistro(payload, queNombranA('cotizaciones', cotizaciones), { titulo: null }, req)
  for (const cotizacion of cotizaciones) {
    const institucion = typeof cotizacion.institucion === 'string' ? cotizacion.institucion.slice(0, 300) : null
    titulosRetirados += await retocarElRegistro(
      payload,
      {
        and: [
          { coleccion: { equals: 'cotizaciones' } },
          { documentoId: { equals: String(cotizacion.id) } },
          { titulo: { not_equals: institucion } },
        ],
      },
      { titulo: institucion },
      req,
    )
  }

  const vivos = new Set(cuentas.map((c) => String(c.email ?? '').trim().toLowerCase()))
  const difusionesRetocadas = await retirarCorreosDeLasDifusiones(
    payload,
    (correo) => !vivos.has(correo.trim().toLowerCase()),
    req,
  )
  const preferenciasHuerfanas = await borrarPreferenciasHuerfanas(payload, req)

  return { accionesAnonimizadas, titulosRetirados, difusionesRetocadas, preferenciasHuerfanas }
}

/** El resumen de una pasada, como lo lee el administrador en el registro. */
export function resumenDeLaConservacion(r: ResultadoDeLaConservacion): string {
  const partes: string[] = []
  if (r.accionesVencidas > 0) {
    partes.push(`borró ${r.accionesVencidas} entradas del registro de más de ${plazoEnPalabras(MESES_DEL_REGISTRO_DE_ACCIONES)}`)
  }
  if (r.cotizacionesVencidas > 0) {
    partes.push(`borró ${r.cotizacionesVencidas} cotizaciones de más de ${plazoEnPalabras(MESES_DE_LAS_COTIZACIONES)}`)
  }
  if (r.accionesAnonimizadas > 0) partes.push(`quitó el nombre y el correo a ${r.accionesAnonimizadas} entradas de cuentas eliminadas`)
  if (r.titulosRetirados > 0) partes.push(`corrigió el título de ${r.titulosRetirados} entradas`)
  if (r.difusionesRetocadas > 0) partes.push(`quitó direcciones de cuentas eliminadas en ${r.difusionesRetocadas} difusiones`)
  if (r.preferenciasHuerfanas > 0) partes.push(`borró ${r.preferenciasHuerfanas} preferencias de cuentas eliminadas`)
  return partes.join(' · ')
}

/**
 * La pasada entera: lo vencido y lo que quedó con nombre. Si no hizo nada, no
 * deja huella: una línea diaria de «no había nada» enterraría las que dicen
 * algo.
 */
export async function aplicarLaConservacion(
  payload: Payload,
  ahora: Date = new Date(),
): Promise<ResultadoDeLaConservacion> {
  const vencido = await borrarLoVencido(payload, ahora)
  const anonimizado = await anonimizarLoDeCuentasBorradas(payload)
  const resultado: ResultadoDeLaConservacion = { ...vencido, ...anonimizado }
  const resumen = resumenDeLaConservacion(resultado)
  if (resumen) {
    await registrarAccion(payload, { accion: 'conservacion', origen: 'conservación', detalle: resumen })
  }
  return resultado
}
