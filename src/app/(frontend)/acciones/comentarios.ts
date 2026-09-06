'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import {
  exigirIdentificador,
  exigirSlugDeModulo,
  exigirTexto,
  LARGO_MAXIMO_COMENTARIO,
} from '@/lib/validacion'

/**
 * Deja un comentario sobre una ficha.
 *
 * Los tres argumentos vienen del navegador y se validan aquí: el módulo debe
 * ser uno de los cinco reales —si no, el registro quedaría apuntando a una
 * colección inexistente y no habría forma de mostrarlo—, y el texto tiene
 * techo, porque un campo libre sin límite es una invitación a llenar la base.
 */
export async function crearComentario(
  coleccion: unknown,
  documentoId: unknown,
  texto: unknown,
): Promise<void> {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo || !usuarioEfectivo) {
    throw new Error('Debe iniciar sesión para comentar.')
  }

  const datos = {
    coleccion: exigirSlugDeModulo(coleccion),
    documentoId: exigirIdentificador(documentoId, 'La ficha'),
    texto: exigirTexto(texto, 'El comentario', LARGO_MAXIMO_COMENTARIO),
    estado: 'pendiente' as const,
  }

  const payload = await getPayload({ config })
  await payload.create({
    collection: 'comentarios',
    data: datos as never,
    user: usuarioEfectivo as never,
  })
}
