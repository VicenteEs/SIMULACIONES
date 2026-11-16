/**
 * El registro de lo que hace cada cuenta, la parte que toca la base (D-145).
 *
 * Lo puro —el vocabulario, la foto de permisos, cuánto abona un latido— está en
 * `src/lib/registro.ts`. Aquí se escribe. Todo con `overrideAccess: true`: estas
 * colecciones no las toca nadie por REST, y quien llega aquí ya es código del
 * servidor.
 *
 * **Anotar no puede romper lo anotado.** Una ficha que se guarda bien no puede
 * fallar porque la bitácora no pudo escribir, así que `registrarAccion` no
 * lanza: cuenta el fallo en el log del servidor y sigue. La excepción la pone
 * la base, no este código: dentro de una transacción de PostgreSQL un error de
 * SQL la deja abortada aunque se capture, y por eso las filas son sencillas,
 * sin nada que pueda violar una restricción (la cuenta existe, el resto es
 * texto).
 */
import type { Payload, PayloadRequest } from 'payload'
import { esFantasma, idDeInstitucion } from '@/access/payload'
import {
  diaLocal,
  fotoDePermisos,
  segundosDelLatido,
  type AccionDelRegistro,
  type CambioDePermiso,
} from './registro'
import { sinLaPeticion, subdominioDeLaPeticionEnCurso } from './barreraDeInstitucion'
import { institucionPorSubdominio } from './institucionesServidor'

type Registro = Record<string, unknown>

export interface EntradaDelRegistro {
  accion: AccionDelRegistro
  /** La cuenta que lo hizo, como documento (con `rol` y módulos). Sin ella, el acto es del sistema. */
  usuario?: unknown
  coleccion?: string
  documentoId?: string | number
  titulo?: string
  detalle?: string
  cambios?: CambioDePermiso[]
  /** Quién fue cuando no fue una cuenta: «importador». */
  origen?: string
  /**
   * La institución donde actuó el soporte de TraumaHub (D-404). Se averigua
   * sola desde la petición; solo la dice quien anota fuera de ella, como la
   * entrada, que corre sin barrera.
   */
  soporteEn?: string
  fecha?: Date
}

/**
 * Dónde actúa como soporte quien hace el acto, o `null` si no es el soporte de
 * TraumaHub dentro de una institución (D-404).
 *
 * Desde el subdominio de una institución solo puede actuar una cuenta de
 * TraumaHub si es el fantasma: las demás no tienen sesión allí. Llega de dos
 * formas, y vale cualquiera: como la sesión la deja (`comoSoporte`, con la
 * institución del lugar y la marca) o como la lee `payload.auth`, la cuenta
 * tal cual, sin institución.
 */
async function soporteDeLaPeticion(payload: Payload, u: Registro | null): Promise<string | null> {
  if (!u) return null
  const subdominio = subdominioDeLaPeticionEnCurso()
  if (!subdominio) return null
  if (!esFantasma(u) && idDeInstitucion(u.institucion) !== null) return null
  try {
    const institucion = await institucionPorSubdominio(payload, subdominio)
    return institucion ? `${institucion.nombre} (${institucion.subdominio})` : subdominio
  } catch {
    return subdominio
  }
}

const idDe = (valor: unknown): number | null => {
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Anota un acto. No lanza nunca.
 *
 * `req` se pasa cuando se anota desde un gancho: así la fila entra en la misma
 * transacción que el acto, y si el acto se deshace, la anotación también (no
 * queda constancia de algo que no ocurrió). Sin él, la escritura es aparte.
 *
 * Lo del soporte de TraumaHub dentro de una institución (D-404) va al registro
 * de TraumaHub, con la institución en `soporteEn`, y no al de la institución:
 * el fantasma entra sin aparecer en su registro (D-371). Desde el subdominio
 * la segunda barrera no deja escribir una fila de TraumaHub, y por eso esa se
 * escribe sin la petición (`sinLaPeticion`), en otra conexión y fuera de la
 * transacción del acto: si el acto se deshace, la línea queda. Para lo que
 * hace el soporte, sobra una línea antes que falte una.
 */
export async function registrarAccion(
  payload: Payload,
  entrada: EntradaDelRegistro,
  req?: Partial<PayloadRequest>,
): Promise<void> {
  try {
    const u = (entrada.usuario ?? null) as Registro | null
    const foto = fotoDePermisos(u)
    const soporteEn = entrada.soporteEn ?? (await soporteDeLaPeticion(payload, u))
    const aparte = soporteEn !== null && subdominioDeLaPeticionEnCurso() !== ''
    const crear = () => payload.create({
      collection: 'registro-de-acciones',
      overrideAccess: true,
      ...(req && !aparte ? { req: req as PayloadRequest } : {}),
      data: {
        fecha: (entrada.fecha ?? new Date()).toISOString(),
        usuario: u ? idDe(u.id) : null,
        usuarioNombre: u && typeof u.nombre === 'string' ? u.nombre : null,
        usuarioCorreo: u && typeof u.email === 'string' ? u.email : null,
        rol: foto?.rol ?? null,
        permisos: foto ?? null,
        accion: entrada.accion,
        coleccion: entrada.coleccion ?? null,
        documentoId: entrada.documentoId === undefined ? null : String(entrada.documentoId),
        titulo: entrada.titulo?.slice(0, 300) ?? null,
        detalle: entrada.detalle?.slice(0, 2000) ?? null,
        cambios: entrada.cambios?.length ? entrada.cambios : null,
        origen: u ? null : (entrada.origen ?? 'sistema'),
        soporteEn: soporteEn?.slice(0, 200) ?? null,
      } as never,
    })
    await (aparte ? sinLaPeticion(crear) : crear())
  } catch (error) {
    payload?.logger?.error({ msg: 'No se pudo anotar en el registro de acciones', err: error })
  }
}

/**
 * Quién hace lo que está pasando en esta petición.
 *
 * Las acciones del panel escriben con la API local y casi nunca le dicen a
 * Payload quién es quien escribe, así que `req.user` llega vacío en la mayoría
 * de los ganchos. Se recupera de la cookie de la petición en curso, que es lo
 * que el navegador de verdad mandó: es la cuenta **real**, no la del modo
 * «ver como residente» del administrador (nadie administra desde una
 * simulación, ni aparenta haberlo hecho). Fuera de Next —un guion, una tarea—
 * `headers()` no existe y el acto queda como del sistema.
 *
 * La respuesta se guarda en `req.context` para no volver a resolverla en cada
 * gancho de la misma petición.
 */
export async function actorDeLaPeticion(req: Partial<PayloadRequest>): Promise<unknown | null> {
  if (req.user) return req.user
  const contexto = (req.context ??= {}) as Registro
  if ('actorDelRegistro' in contexto) return contexto.actorDelRegistro ?? null
  let actor: unknown = null
  try {
    const { headers } = await import('next/headers')
    const cabeceras = await headers()
    const resultado = await req.payload!.auth({ headers: cabeceras })
    actor = resultado.user ?? null
  } catch {
    actor = null
  }
  contexto.actorDelRegistro = actor
  return actor
}

// ---------------------------------------------------------------- el latido

/**
 * Abona un latido de actividad a la cuenta: suma los segundos que de verdad
 * pasaron desde el anterior a la fila de su día.
 *
 * La fila es única por cuenta y día (índice único). Si dos pestañas latieran a
 * la vez y las dos no la encontraran, una de las dos creaciones falla por ese
 * índice; se vuelve a buscar y se suma a la que ganó.
 */
export async function registrarLatido(
  payload: Payload,
  usuarioId: string | number,
  ruta: string,
  ahora: Date = new Date(),
): Promise<void> {
  const id = idDe(usuarioId)
  if (id === null) return
  const dia = diaLocal(ahora)
  const hora = String(ahora.getHours()).padStart(2, '0')

  const buscar = async () => {
    const { docs } = await payload.find({
      collection: 'tiempo-activo',
      where: { and: [{ usuario: { equals: id } }, { dia: { equals: dia } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return (docs[0] as unknown as Registro | undefined) ?? null
  }

  const sumar = async (fila: Registro) => {
    const ultimo = typeof fila.ultimoLatido === 'string' ? Date.parse(fila.ultimoLatido) : null
    const abono = segundosDelLatido(ultimo, ahora.getTime())
    const porHora = { ...((fila.porHora as Record<string, number> | null) ?? {}) }
    if (abono > 0) porHora[hora] = (porHora[hora] ?? 0) + abono
    await payload.update({
      collection: 'tiempo-activo',
      id: fila.id as number,
      overrideAccess: true,
      data: {
        segundos: Number(fila.segundos ?? 0) + abono,
        latidos: Number(fila.latidos ?? 0) + 1,
        porHora,
        ultimoLatido: ahora.toISOString(),
        ultimaRuta: ruta.slice(0, 200),
      } as never,
    })
  }

  const existente = await buscar()
  if (existente) return sumar(existente)
  try {
    await payload.create({
      collection: 'tiempo-activo',
      overrideAccess: true,
      data: { usuario: id, dia, segundos: 0, latidos: 1, porHora: {}, ultimoLatido: ahora.toISOString(), ultimaRuta: ruta.slice(0, 200) } as never,
    })
  } catch (error) {
    const ganadora = await buscar()
    if (!ganadora) throw error
    await sumar(ganadora)
  }
}
