import type { Payload } from 'payload'
import { esFantasma, idDeInstitucion } from '@/access/payload'
import { direccionPublica } from '@/collections/Usuarios'
import { avisosGuardados, guardarAvisos, type AvisoVigente } from './avisosEnMemoria'
import { difusionLlegaA, normalizarLugares, restoDentroDeLaPlataforma } from './destinoDeDifusion'

/**
 * Los avisos dentro de la plataforma (P-016 E6, D-375, D-406): las difusiones
 * que salen «como aviso» y que cada cuenta ve en la barra hasta cerrarlas.
 *
 * Se preguntan en cada página, porque la barra está en todas. Por eso los
 * avisos vigentes se guardan en la memoria del proceso por medio minuto: casi
 * siempre no hay ninguno para la cuenta, y entonces la página no hace ni una
 * consulta más. Con varios procesos (D-393), un aviso nuevo tarda como mucho
 * eso en verse en todos.
 */

const VIVEN_LOS_VIGENTES_MS = 30_000

/** Cuántos avisos se miran como mucho: los más nuevos. Más que eso ya no es un aviso sino un tablón. */
const TOPE_DE_AVISOS = 20

async function avisosVigentes(payload: Payload, ahora: Date): Promise<AvisoVigente[]> {
  const guardados = avisosGuardados(ahora.getTime())
  if (guardados) return guardados
  const { docs } = await payload.find({
    collection: 'difusiones',
    where: { and: [{ comoAviso: { equals: true } }, { avisoHasta: { greater_than: ahora.toISOString() } }] },
    sort: '-createdAt',
    limit: TOPE_DE_AVISOS,
    depth: 0,
    overrideAccess: true,
  })
  const lista = docs.map((d) => ({
    id: String(d.id),
    asunto: d.asunto,
    mensaje: d.mensaje,
    botonTexto: d.botonTexto?.trim() || null,
    botonEnlace: d.botonEnlace?.trim() || null,
    audiencia: d.audiencia,
    lugares: normalizarLugares(d.lugares),
    creado: d.createdAt,
  }))
  guardarAvisos(lista, ahora.getTime() + VIVEN_LOS_VIGENTES_MS)
  return lista
}

/** Lo que la barra necesita de un aviso. */
export interface AvisoDeLaPlataforma {
  id: string
  asunto: string
  mensaje: string
  creado: string
  leido: boolean
  /**
   * El botón. `interno` es una ruta de la plataforma, que se abre en el lugar
   * donde se está; `externo`, una dirección de fuera, que se abre aparte.
   */
  boton: { texto: string; interno: string } | { texto: string; externo: string } | null
}

/**
 * Los avisos vigentes que le llegan a una cuenta, con si ya los leyó.
 *
 * Se mira la cuenta real, no la de «ver como residente»: el aviso es para la
 * persona. El soporte de TraumaHub dentro de una institución (D-404) no ve
 * los de ella: no es de ella, y su lectura quedaría en su lugar.
 */
export async function avisosDeLaCuenta(
  payload: Payload,
  cuenta: Record<string, unknown> | null | undefined,
  ahora: Date = new Date(),
): Promise<AvisoDeLaPlataforma[]> {
  if (!cuenta || cuenta.activo !== true || esFantasma(cuenta)) return []
  const institucion = idDeInstitucion(cuenta.institucion)
  const suyos = (await avisosVigentes(payload, ahora)).filter((aviso) =>
    difusionLlegaA(aviso, { rol: cuenta.rol, institucion }),
  )
  if (suyos.length === 0) return []

  const { docs: lecturas } = await payload.find({
    collection: 'lecturas-de-avisos',
    where: { and: [{ usuario: { equals: cuenta.id } }, { difusion: { in: suyos.map((a) => a.id) } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { difusion: true },
  })
  const leidos = new Set(lecturas.map((l) => String(typeof l.difusion === 'object' ? l.difusion?.id : l.difusion)))
  const base = direccionPublica()

  return suyos.map((aviso) => {
    let boton: AvisoDeLaPlataforma['boton'] = null
    if (aviso.botonTexto && aviso.botonEnlace) {
      const interno = restoDentroDeLaPlataforma(aviso.botonEnlace, base)
      boton = interno === null ? { texto: aviso.botonTexto, externo: aviso.botonEnlace } : { texto: aviso.botonTexto, interno }
    }
    return { id: aviso.id, asunto: aviso.asunto, mensaje: aviso.mensaje, creado: aviso.creado, leido: leidos.has(aviso.id), boton }
  })
}
