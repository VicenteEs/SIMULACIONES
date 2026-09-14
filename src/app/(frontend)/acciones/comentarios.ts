'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { usuarioDeSesion } from '@/access/payload'
import { puedeVerModulo } from '@/access/reglas'
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

  const modulo = exigirSlugDeModulo(coleccion)
  // Que el módulo exista no dice que esta cuenta lo vea. La escritura de abajo
  // va por la API local, con `overrideAccess: true`, así que la regla de
  // creación de la colección (`creacionEnModuloVisible`) no se consulta: sin
  // esta pregunta, quien tiene el simulador vetado comentaba igual una cirugía
  // llamando a la acción desde la consola, y el comentario le llegaba al
  // traumatólogo desde un módulo que para esa cuenta no existe. Se pregunta a la
  // misma regla que la colección, antes de abrir la base.
  if (!puedeVerModulo(usuarioDeSesion(usuarioEfectivo), modulo)) {
    throw new Error('Su cuenta no tiene acceso a ese módulo.')
  }

  const datos = {
    coleccion: modulo,
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
