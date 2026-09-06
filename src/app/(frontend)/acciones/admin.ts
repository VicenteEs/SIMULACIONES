'use server'

/**
 * Acciones del panel de administración.
 *
 * Todas comparten tres cuidados, y ninguno es opcional:
 *
 *  1. Comprueban el rol real de quien llama (`exigirAdmin`), porque una acción
 *     de servidor se puede invocar sin pasar por la interfaz que la ofrece.
 *  2. Validan cada argumento, porque el tipo de TypeScript desaparece al
 *     compilar y lo que llega es lo que el navegador quiso enviar.
 *  3. Impiden que el administrador se deje fuera a sí mismo. Es el fallo más
 *     fácil de cometer y el más caro de reparar: exige entrar a la base a mano.
 */

import { revalidatePath } from 'next/cache'
import type { Payload } from 'payload'
import { exigirAdmin, exigirEditor, accion, type Respuesta } from '@/lib/guardias'
import {
  exigirContrasena,
  exigirCorreo,
  exigirIdentificador,
  exigirRol,
  exigirTexto,
  modulosValidos,
  textoOpcional,
} from '@/lib/validacion'

const RUTA_USUARIOS = '/admin-panel/usuarios'
const RUTA_COMENTARIOS = '/admin-panel/comentarios'

/** Cuántos administradores activos quedan además del indicado. */
async function otrosAdminsActivos(payload: Payload, exceptoId: string): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'usuarios',
    where: {
      and: [
        { rol: { equals: 'admin' } },
        { activo: { equals: true } },
        { id: { not_equals: exceptoId } },
      ],
    },
    overrideAccess: true,
  })
  return totalDocs
}

/**
 * La plataforma debe conservar siempre un administrador activo.
 *
 * Sin esta comprobación, quitarse el rol o desactivarse por descuido deja la
 * instalación sin nadie capaz de crear cuentas, y la única salida es editar la
 * tabla `usuarios` desde psql.
 */
async function exigirQueQuedeUnAdmin(payload: Payload, id: string, queSeIntenta: string) {
  if ((await otrosAdminsActivos(payload, id)) === 0) {
    throw new Error(
      `No se puede ${queSeIntenta}: es el único administrador activo y la plataforma ` +
        'quedaría sin nadie que pueda gestionar cuentas.',
    )
  }
}

// ---------------------------------------------------------------- usuarios

export async function crearUsuario(
  email: unknown,
  nombre: unknown,
  contrasena: unknown,
  rol: unknown,
  institucion?: unknown,
  activo: unknown = true,
): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    const creado = await payload.create({
      collection: 'usuarios',
      data: {
        email: exigirCorreo(email),
        nombre: exigirTexto(nombre, 'El nombre', 120),
        password: exigirContrasena(contrasena),
        rol: exigirRol(rol),
        institucion: textoOpcional(institucion, 'La institución', 160),
        activo: activo !== false,
      },
      user: usuario as never,
    })
    revalidatePath(RUTA_USUARIOS)
    return { id: String(creado.id) }
  })
}

/** Campos que el panel puede modificar. Cualquier otro se ignora. */
export async function actualizarUsuario(
  id: unknown,
  datos: {
    nombre?: unknown
    rol?: unknown
    institucion?: unknown
    email?: unknown
    modulosVisibles?: unknown
    modulosEditables?: unknown
  },
): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario, usuarioId } = await exigirAdmin()
    const objetivo = exigirIdentificador(id, 'El usuario')

    const cambios: Record<string, unknown> = {}
    if (datos.nombre !== undefined) cambios.nombre = exigirTexto(datos.nombre, 'El nombre', 120)
    if (datos.email !== undefined) cambios.email = exigirCorreo(datos.email)
    if (datos.institucion !== undefined) {
      cambios.institucion = textoOpcional(datos.institucion, 'La institución', 160) ?? null
    }
    if (datos.modulosVisibles !== undefined) {
      cambios.modulosVisibles = modulosValidos(datos.modulosVisibles)
    }
    if (datos.modulosEditables !== undefined) {
      cambios.modulosEditables = modulosValidos(datos.modulosEditables)
    }
    if (datos.rol !== undefined) {
      const nuevoRol = exigirRol(datos.rol)
      if (objetivo === usuarioId && nuevoRol !== 'admin') {
        throw new Error('No puede quitarse a sí mismo el rol de administrador.')
      }
      if (nuevoRol !== 'admin') await exigirQueQuedeUnAdmin(payload, objetivo, 'cambiarle el rol')
      cambios.rol = nuevoRol
    }

    if (Object.keys(cambios).length === 0) throw new Error('No hay nada que cambiar.')

    await payload.update({
      collection: 'usuarios',
      id: objetivo,
      data: cambios as never,
      user: usuario as never,
    })
    revalidatePath(RUTA_USUARIOS)
    return null
  })
}

export async function cambiarActivoUsuario(id: unknown, activo: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario, usuarioId } = await exigirAdmin()
    const objetivo = exigirIdentificador(id, 'El usuario')
    const nuevoEstado = activo === true

    if (!nuevoEstado) {
      if (objetivo === usuarioId) throw new Error('No puede desactivar su propia cuenta.')
      await exigirQueQuedeUnAdmin(payload, objetivo, 'desactivar esta cuenta')
    }

    await payload.update({
      collection: 'usuarios',
      id: objetivo,
      data: { activo: nuevoEstado },
      user: usuario as never,
    })
    revalidatePath(RUTA_USUARIOS)
    return null
  })
}

export async function eliminarUsuario(id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario, usuarioId } = await exigirAdmin()
    const objetivo = exigirIdentificador(id, 'El usuario')

    if (objetivo === usuarioId) throw new Error('No puede eliminar su propia cuenta.')
    await exigirQueQuedeUnAdmin(payload, objetivo, 'eliminar esta cuenta')

    await payload.delete({
      collection: 'usuarios',
      id: objetivo,
      user: usuario as never,
    })
    revalidatePath(RUTA_USUARIOS)
    return null
  })
}

/**
 * Emite un enlace de restablecimiento de contraseña.
 *
 * El administrador no fija la clave de nadie: entrega un enlace de un solo uso
 * y quien lo recibe elige su contraseña. Si hay servidor de correo configurado
 * llega además por correo; si no, el panel muestra el enlace para entregarlo
 * por el canal que corresponda.
 */
export async function generarEnlaceDeClave(
  id: unknown,
): Promise<Respuesta<{ enlace: string; enviadoPorCorreo: boolean }>> {
  return accion(async () => {
    const { payload } = await exigirAdmin()
    const objetivo = exigirIdentificador(id, 'El usuario')

    const cuenta = await payload.findByID({
      collection: 'usuarios',
      id: objetivo,
      overrideAccess: true,
    })
    const correo = (cuenta as { email?: string }).email
    if (!correo) throw new Error('La cuenta no tiene correo asociado.')

    const hayCorreo = Boolean(process.env.SMTP_HOST)
    const testigo = await payload.forgotPassword({
      collection: 'usuarios',
      data: { email: correo },
      disableEmail: !hayCorreo,
    })

    const base = process.env.NEXT_PUBLIC_SERVER_URL || ''
    return { enlace: `${base}/clave/${testigo}`, enviadoPorCorreo: hayCorreo }
  })
}

// ------------------------------------------------------------- comentarios

export async function actualizarComentario(id: unknown, estado: unknown): Promise<Respuesta> {
  return accion(async () => {
    // El editor también resuelve: es quien arregla lo que se le señala.
    const { payload, usuario } = await exigirEditor()
    if (estado !== 'pendiente' && estado !== 'resuelto') {
      throw new Error('El estado del comentario no es válido.')
    }
    await payload.update({
      collection: 'comentarios',
      id: exigirIdentificador(id, 'El comentario'),
      data: { estado },
      user: usuario as never,
    })
    revalidatePath(RUTA_COMENTARIOS)
    return null
  })
}

export async function eliminarComentario(id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    await payload.delete({
      collection: 'comentarios',
      id: exigirIdentificador(id, 'El comentario'),
      user: usuario as never,
    })
    revalidatePath(RUTA_COMENTARIOS)
    return null
  })
}

/** Marca como resueltos todos los comentarios pendientes de una sola vez. */
export async function resolverTodosLosComentarios(): Promise<Respuesta<{ resueltos: number }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const resultado = await payload.update({
      collection: 'comentarios',
      where: { estado: { equals: 'pendiente' } },
      data: { estado: 'resuelto' },
      user: usuario as never,
    })
    revalidatePath(RUTA_COMENTARIOS)
    return { resueltos: resultado.docs?.length ?? 0 }
  })
}
