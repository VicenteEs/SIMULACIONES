/**
 * La institución de la petición en curso, leída de la base (D-371, D-396).
 *
 * `proxy.ts` deja el subdominio en una cabecera; aquí se convierte en la fila
 * de `instituciones`. Se le pregunta en cada pintado, en cada acción y en cada
 * entrada, así que cada proceso guarda lo que leyó un rato:
 *
 * - **30 segundos** lo encontrado. Una institución cambia muy de vez en cuando
 *   (un plazo extendido, un cupo nuevo), y medio minuto de retraso en los
 *   otros tres procesos no le quita nada a nadie. En el proceso que la cambió,
 *   `olvidarInstituciones` la borra en el acto;
 * - **5 segundos** lo que no existe. Si no, un subdominio pedido justo antes
 *   de crear su institución diría «no existe» medio minuto más.
 *
 * Como `mantencion.ts`, recibe el cliente de Payload de fuera y no importa la
 * configuración: la usan los ganchos de las colecciones.
 */
import type { Payload } from 'payload'
import { CABECERA_DEL_SUBDOMINIO } from './anfitrion'

/** Lo que la plataforma necesita saber de una institución en cada petición. */
export interface InstitucionDelAnfitrion {
  id: string
  nombre: string
  subdominio: string
  modalidad: 'piloto' | 'definitiva'
  inicio: string
  vence: string | null
  cupo: number
}

const VIVE_LO_ENCONTRADO_MS = 30_000
const VIVE_LO_QUE_NO_EXISTE_MS = 5_000

const guardadas = new Map<string, { valor: InstitucionDelAnfitrion | null; hasta: number }>()

/** Borra lo guardado: lo llama el gancho de `instituciones` al escribir una. */
export function olvidarInstituciones(): void {
  guardadas.clear()
}

function aInstitucion(fila: Record<string, unknown>): InstitucionDelAnfitrion {
  return {
    id: String(fila.id),
    nombre: String(fila.nombre ?? ''),
    subdominio: String(fila.subdominio ?? ''),
    modalidad: fila.modalidad === 'definitiva' ? 'definitiva' : 'piloto',
    inicio: String(fila.inicio ?? ''),
    vence: typeof fila.vence === 'string' && fila.vence ? fila.vence : null,
    cupo: Number(fila.cupo ?? 0),
  }
}

/**
 * La institución de ese subdominio, o `null` si no hay ninguna. Para `''`, la
 * central, `null` sin preguntar.
 *
 * Con `overrideAccess`: quien pregunta es la plataforma, para saber dónde está,
 * no la cuenta, que puede ni tener sesión todavía.
 */
export async function institucionPorSubdominio(
  payload: Pick<Payload, 'find'>,
  subdominio: string,
  ahora: number = Date.now(),
): Promise<InstitucionDelAnfitrion | null> {
  if (!subdominio) return null
  const guardada = guardadas.get(subdominio)
  if (guardada && guardada.hasta > ahora) return guardada.valor
  const { docs } = await payload.find({
    collection: 'instituciones',
    where: { subdominio: { equals: subdominio } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const valor = docs[0] ? aInstitucion(docs[0] as unknown as Record<string, unknown>) : null
  guardadas.set(subdominio, { valor, hasta: ahora + (valor ? VIVE_LO_ENCONTRADO_MS : VIVE_LO_QUE_NO_EXISTE_MS) })
  return valor
}

/** El subdominio que dejó el proxy en las cabeceras, o `''`, la central. */
export function subdominioDeLasCabeceras(cabeceras: Pick<Headers, 'get'> | null | undefined): string {
  return (cabeceras?.get(CABECERA_DEL_SUBDOMINIO) ?? '').trim().toLowerCase()
}

/**
 * El subdominio de la institución de una cuenta, para armar sus enlaces
 * (`direccionPublica`), a partir de lo que trae su campo `institucion`: el
 * identificador o la fila ya poblada. `''` si es de TraumaHub.
 *
 * No lanza. Si la institución no se puede leer, anota el fallo y devuelve
 * `''`: el enlace sale a la central, donde la cuenta no entra, pero el correo
 * que lo lleva casi siempre se manda sin esperar y no tiene a quién avisar.
 */
export async function subdominioDeLaCuenta(payload: Pick<Payload, 'findByID' | 'logger'>, institucion: unknown): Promise<string> {
  if (institucion === null || institucion === undefined || institucion === '') return ''
  if (typeof institucion === 'object' && typeof (institucion as { subdominio?: unknown }).subdominio === 'string') {
    return (institucion as { subdominio: string }).subdominio
  }
  const id = typeof institucion === 'object' ? (institucion as { id?: unknown }).id : institucion
  if (typeof id !== 'string' && typeof id !== 'number') return ''
  try {
    const fila = await payload.findByID({ collection: 'instituciones', id, depth: 0, overrideAccess: true })
    return String((fila as { subdominio?: unknown }).subdominio ?? '')
  } catch (fallo) {
    payload.logger.error({ msg: 'No se pudo leer la institución de una cuenta para armar su enlace', err: fallo })
    return ''
  }
}

/**
 * El nombre de una institución, para un correo. `null` si es la central o si no
 * se pudo leer: el correo sale igual, sin esa fila.
 */
export async function nombreDeLaInstitucion(
  payload: Pick<Payload, 'findByID' | 'logger'>,
  id: string | null,
): Promise<string | null> {
  if (!id) return null
  try {
    const fila = await payload.findByID({ collection: 'instituciones', id, depth: 0, overrideAccess: true })
    const nombre = (fila as { nombre?: unknown }).nombre
    return typeof nombre === 'string' && nombre.trim() ? nombre.trim() : null
  } catch (fallo) {
    payload.logger.error({ msg: 'No se pudo leer el nombre de una institución para un correo', err: fallo })
    return null
  }
}

/** Dónde está la petición: su subdominio, y la institución, si existe. */
export interface LugarDeLaPeticion {
  subdominio: string
  institucion: InstitucionDelAnfitrion | null
}

export async function lugarDeLaPeticion(
  payload: Pick<Payload, 'find'>,
  cabeceras: Pick<Headers, 'get'> | null | undefined,
): Promise<LugarDeLaPeticion> {
  const subdominio = subdominioDeLasCabeceras(cabeceras)
  return { subdominio, institucion: await institucionPorSubdominio(payload, subdominio) }
}
