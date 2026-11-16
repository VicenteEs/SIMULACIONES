import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { filtroDelLugar } from '@/access/reglas'

/**
 * El enlace de invitación de cada institución y su cupo (P-016 E5.7, D-402).
 *
 * Los alumnos de una institución piden su cuenta con el enlace que les da su
 * administrador, y él los aprueba hasta llenar el cupo (D-371). En la central
 * nada de esto aplica: allí se pide la cuenta como siempre.
 */

/**
 * Un código nuevo: 15 bytes al azar, veinte caracteres en el enlace. Es lo
 * único que separa el formulario de una institución de cualquiera que adivine
 * su subdominio, y adivinar 120 bits con cinco intentos por hora no se hace.
 */
export const nuevoCodigoDeInvitacion = (): string => randomBytes(15).toString('base64url')

/**
 * ¿Es este el código guardado? En tiempo constante: compararlos con `===` dice,
 * por lo que tarda, cuántos caracteres del principio acertó quien prueba. Se
 * comparan sus resúmenes para que el largo distinto no corte antes.
 */
export function codigosIguales(dado: unknown, guardado: unknown): boolean {
  if (typeof dado !== 'string' || typeof guardado !== 'string' || !guardado || !dado.trim()) return false
  const a = createHash('sha256').update(dado.trim()).digest()
  const b = createHash('sha256').update(guardado).digest()
  return timingSafeEqual(a, b)
}

/** El enlace que reparte el administrador de la institución. */
export const rutaDeInvitacion = (codigo: string): string => `/registro?invitacion=${encodeURIComponent(codigo)}`

/** El código de una institución, leído aparte: no viaja en lo que se guarda del anfitrión. */
export async function codigoDeLaInstitucion(
  payload: Pick<Payload, 'findByID'>,
  institucion: string,
  req?: Partial<PayloadRequest>,
): Promise<string | null> {
  const fila = await payload.findByID({
    collection: 'instituciones',
    id: institucion,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    ...(req ? { req } : {}),
  })
  const codigo = (fila as { codigoDeInvitacion?: unknown } | null)?.codigoDeInvitacion
  return typeof codigo === 'string' && codigo ? codigo : null
}

export interface EstadoDelCupo {
  nombre: string
  /** Para armar su enlace (`direccionPublica`). */
  subdominio: string
  cupo: number
  /** Cuentas activas de cualquier rol, también la del administrador (D-400). */
  activas: number
}

/** Cuánto lleva una institución de su cupo, o `null` si no existe. */
export async function estadoDelCupo(
  payload: Pick<Payload, 'findByID' | 'count'>,
  institucion: string,
  req?: Partial<PayloadRequest>,
): Promise<EstadoDelCupo | null> {
  const enLaPeticion = req ? { req } : {}
  const fila = await payload.findByID({
    collection: 'instituciones',
    id: institucion,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    ...enLaPeticion,
  })
  if (!fila) return null
  const { totalDocs } = await payload.count({
    collection: 'usuarios',
    where: { and: [{ activo: { equals: true } }, filtroDelLugar(institucion)] } as never,
    overrideAccess: true,
    ...enLaPeticion,
  })
  const datos = fila as { nombre?: unknown; subdominio?: unknown; cupo?: unknown }
  return {
    nombre: typeof datos.nombre === 'string' ? datos.nombre : 'La institución',
    subdominio: typeof datos.subdominio === 'string' ? datos.subdominio : '',
    cupo: typeof datos.cupo === 'number' ? datos.cupo : 0,
    activas: totalDocs,
  }
}

/**
 * Antes de dejar activa una cuenta más de una institución: que quede un lugar
 * en su cupo. La central no tiene cupo.
 *
 * Se llama dentro de `conCandado(payload, candadoDelCupo(lugar), …)` y con su
 * `req`, con la escritura que activa detrás: sin el candado, dos aprobaciones a
 * la vez ven el mismo último lugar libre y entran las dos.
 */
export async function exigirCupoLibre(
  payload: Pick<Payload, 'findByID' | 'count'>,
  institucion: string | null,
  req?: Partial<PayloadRequest>,
): Promise<void> {
  if (!institucion) return
  const estado = await estadoDelCupo(payload, institucion, req)
  if (!estado) throw new Error('No se encontró la institución de esta cuenta.')
  if (estado.activas < estado.cupo) return
  throw new Error(
    `${estado.nombre} llenó su cupo: ${estado.activas} de ${estado.cupo} cuentas activas. ` +
      'Desactive una cuenta para liberar su lugar, o pida a TraumaHub que amplíe el cupo.',
  )
}

/** El nombre del candado del cupo de una institución. */
export const candadoDelCupo = (institucion: string): string => `cupo:${institucion}`
