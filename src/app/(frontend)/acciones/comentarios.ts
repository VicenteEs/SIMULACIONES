'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { usuarioDeSesion } from '@/access/payload'
import { puedeEditarContenido, puedeVerModulo } from '@/access/reglas'
import { exigirEditor, accion, type Respuesta } from '@/lib/guardias'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { crearLimitador } from '@/lib/ritmo'
import { obtenerSesion } from '@/lib/sesion'
import {
  anclaOpcional,
  DESTINO_TALLER,
  exigirDestinoDeComentario,
  exigirIdentificador,
  exigirSlugDeModulo,
  exigirTexto,
  LARGO_MAXIMO_COMENTARIO,
} from '@/lib/validacion'

/**
 * Cuántos comentarios deja una cuenta en diez minutos.
 *
 * El techo de longitud acota cada comentario, no cuántos. Y cada uno manda un
 * correo a los administradores (`Comentarios.ts`, `afterChange`), por la misma
 * cuenta de cPanel y con la misma cuota por hora que la recuperación de
 * contraseña: una sola cuenta de residente llamando a esta acción en bucle
 * llenaba la bandeja del panel, los buzones de los administradores, y dejaba a
 * quien olvidó su clave sin el correo para recuperarla. Diez en diez minutos es
 * más de lo que nadie escribe leyendo una ficha.
 */
const LIMITE_DE_COMENTARIOS = crearLimitador('comentarios:cuenta', {
  maximo: 10,
  ventanaMs: 10 * 60 * 1000,
})

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
  ancla?: unknown,
): Promise<void> {
  const { activo, usuarioEfectivo, usuario, rolReal } = await obtenerSesion()
  if (!activo || !usuarioEfectivo) {
    throw new Error('Debe iniciar sesión para comentar.')
  }

  const destino = exigirDestinoDeComentario(coleccion)
  if (destino === DESTINO_TALLER) {
    // El taller anatómico (E2, D-158). Con el rol **real** y no el efectivo: el
    // taller es del panel, y quien lo usa lo usa como lo que es aunque tenga
    // puesta la vista de residente para mirar una ficha.
    if (!usuario || !puedeEditarContenido(usuarioDeSesion(usuario)) || (rolReal !== 'admin' && rolReal !== 'editor')) {
      throw new Error('Solo quien trabaja en el taller anatómico puede comentar sus preparaciones.')
    }
    if (!LIMITE_DE_COMENTARIOS.permitir(String((usuario as { id?: unknown }).id))) {
      throw new Error(
        'Dejó varios comentarios en pocos minutos. Espere un poco antes de escribir el siguiente.',
      )
    }
    const id = exigirIdentificador(documentoId, 'La preparación')
    const payload = await getPayload({ config })
    // Una preparación sin guardar no tiene fila a la que colgar el comentario.
    const existe = await payload
      .findByID({ collection: 'instancias-atlas', id, depth: 0, overrideAccess: true })
      .then(() => true, () => false)
    if (!existe) throw new Error('Esa preparación no existe. Guárdela con nombre antes de comentarla.')
    await payload.create({
      collection: 'comentarios',
      data: {
        coleccion: DESTINO_TALLER,
        documentoId: id,
        texto: exigirTexto(texto, 'El comentario', LARGO_MAXIMO_COMENTARIO),
        estado: 'pendiente',
        ancla: anclaOpcional(ancla),
      } as never,
      user: usuario as never,
    })
    return
  }

  if (ancla !== undefined && ancla !== null) {
    throw new Error('Solo los comentarios del taller anatómico llevan ancla.')
  }
  const modulo = exigirSlugDeModulo(destino)
  // Que el módulo exista no dice que esta cuenta lo vea. La escritura de abajo
  // va por la API local, con `overrideAccess: true`, así que la regla de
  // creación de la colección (`creacionEnModuloVisible`) no se consulta: sin
  // esta pregunta, quien tiene el simulador vetado comentaba igual una cirugía
  // llamando a la acción desde la consola, y el comentario le llegaba al
  // traumatólogo desde un módulo que para esa cuenta no existe. Se pregunta a la
  // misma regla que la colección, antes de abrir la base.
  // Y un módulo en mantención tampoco, para el residente (D-156).
  if (!puedeVerModulo(usuarioDeSesion(usuarioEfectivo), modulo, await modulosEnMantencion())) {
    throw new Error('Su cuenta no tiene acceso a ese módulo.')
  }

  if (!LIMITE_DE_COMENTARIOS.permitir(String((usuarioEfectivo as { id?: unknown }).id))) {
    throw new Error(
      'Dejó varios comentarios en pocos minutos. Espere un poco antes de escribir el siguiente.',
    )
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

// ---------------------------------------------------- leer los de una ficha

/** Un comentario tal como lo pinta la pestaña del taller. */
export interface ComentarioDelTaller {
  id: string
  texto: string
  estado: 'pendiente' | 'resuelto'
  creado: string
  autor: string | null
  /** El identificador de quien lo escribió, para que la pestaña sepa cuáles son suyos. */
  autorId: string | null
  ancla: { pieza: string; punto?: [number, number, number]; vista?: { camara: [number, number, number]; objetivo: [number, number, number] } } | null
}

/**
 * Los comentarios de una preparación, los más recientes arriba.
 *
 * Con `exigirEditor` y rol real: el taller es del panel, y la regla de lectura
 * de la colección ya deja a todo editor ver todos los comentarios. Se pasa por
 * aquí y no por `payload.find` desde el navegador porque la API REST de
 * Payload está cerrada (D-073). El ancla se vuelve a pasar por
 * `anclaOpcional`: lo guardado sobrevive a una validación más vieja, y la pestaña
 * va a mandar la cámara a esos números.
 */
export async function listarComentariosDe(
  coleccion: unknown,
  documentoId: unknown,
): Promise<Respuesta<ComentarioDelTaller[]>> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    if (exigirDestinoDeComentario(coleccion) !== DESTINO_TALLER) {
      throw new Error('Esta lista es la del taller anatómico.')
    }
    const id = exigirIdentificador(documentoId, 'La preparación')
    const { docs } = await payload.find({
      collection: 'comentarios',
      where: { and: [{ coleccion: { equals: DESTINO_TALLER } }, { documentoId: { equals: id } }] },
      sort: '-createdAt',
      limit: 200,
      depth: 1,
      overrideAccess: true,
    })
    return docs.map((d) => {
      const c = d as unknown as Record<string, unknown>
      const autor = c.usuario as { id?: unknown; nombre?: string; email?: string } | null
      let ancla: ComentarioDelTaller['ancla'] = null
      try {
        ancla = anclaOpcional(c.ancla) ?? null
      } catch {
        ancla = null
      }
      return {
        id: String(c.id),
        texto: String(c.texto ?? ''),
        estado: c.estado === 'resuelto' ? 'resuelto' : 'pendiente',
        creado: String(c.createdAt ?? ''),
        autor: autor?.nombre?.trim() || autor?.email || null,
        autorId: autor?.id !== undefined && autor?.id !== null ? String(autor.id) : null,
        ancla,
      }
    })
  })
}
