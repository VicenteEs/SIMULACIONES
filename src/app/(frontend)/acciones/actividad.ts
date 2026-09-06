'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { exigirIdentificador, exigirSlugDeModulo } from '@/lib/validacion'

/**
 * Registro de lo que cada residente ha visitado y marcado como leído.
 *
 * Las dos acciones públicas —visitar y marcar— hacen lo mismo salvo por un
 * campo, así que comparten implementación: eran dos copias que ya habían
 * empezado a divergir.
 *
 * Un fallo aquí no debe estropear la lectura de una ficha: el seguimiento es
 * una comodidad, no el contenido. Por eso los errores se registran y se tragan
 * en lugar de propagarse a la página.
 */
async function anotar(
  coleccion: unknown,
  documentoId: unknown,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo || !usuarioEfectivo) return

  const usuarioId = (usuarioEfectivo as { id?: unknown }).id
  if (!usuarioId) return

  try {
    const modulo = exigirSlugDeModulo(coleccion)
    const documento = exigirIdentificador(documentoId, 'La ficha')
    const payload = await getPayload({ config })

    const existente = await payload.find({
      collection: 'actividad',
      where: {
        and: [
          { usuario: { equals: usuarioId } },
          { coleccion: { equals: modulo } },
          { documentoId: { equals: documento } },
        ],
      },
      user: usuarioEfectivo as never,
      limit: 1,
      depth: 0,
    })

    // `ultimaVisita` la fija el hook de la colección en cada escritura; aquí
    // solo se decide si hay que crear el registro o actualizarlo.
    if (existente.docs.length > 0) {
      await payload.update({
        collection: 'actividad',
        id: existente.docs[0].id,
        data: extra as never,
        user: usuarioEfectivo as never,
      })
    } else {
      await payload.create({
        collection: 'actividad',
        data: { coleccion: modulo, documentoId: documento, ...extra } as never,
        user: usuarioEfectivo as never,
      })
    }
  } catch (error) {
    console.error('[actividad] no se pudo registrar la visita:', error)
  }
}

export async function registrarVisita(coleccion: unknown, documentoId: unknown): Promise<void> {
  await anotar(coleccion, documentoId)
}

export async function marcarComoLeida(
  coleccion: unknown,
  documentoId: unknown,
  completado: unknown,
): Promise<void> {
  await anotar(coleccion, documentoId, { completado: completado === true })
}
