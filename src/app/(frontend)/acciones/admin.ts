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

/** Cuántos administradores activos hay en total, sin excluir a nadie. */
async function adminsActivos(payload: Payload): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'usuarios',
    where: { and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }] },
    overrideAccess: true,
  })
  return totalDocs
}

/**
 * Segunda mirada, ya escrito el cambio: si la plataforma se quedó sin ningún
 * administrador activo, se le devuelve el rol y la cuenta activa a quien llama.
 *
 * `exigirQueQuedeUnAdmin` cuenta antes de escribir, y las dos cosas son
 * operaciones distintas. Con el aislamiento por omisión de PostgreSQL —READ
 * COMMITTED, que es con el que corre el adaptador— ninguna transacción ve la
 * escritura sin confirmar de la otra: si dos administradores se desactivan a la
 * vez, el conteo de cada uno ve al otro todavía activo, los dos pasan la
 * comprobación y la instalación se queda sin ninguno. A partir de ahí nadie
 * entra al panel, la pantalla de instalación tampoco sirve —`crearPrimeraCuenta`
 * exige que no haya ninguna cuenta— y la única salida es editar la tabla
 * `usuarios` desde psql en un servidor compartido.
 *
 * Envolver el par en una transacción **no** lo arregla: el conteo seguiría sin
 * ver lo ajeno sin confirmar, y los dos pasarían igual. Lo que cierra el hueco
 * de verdad es una restricción en la base, y esa necesita su migración; mientras
 * no esté, esto reduce la ventana a los milisegundos que separan las dos
 * consultas y deja el invariante en pie sin que haga falta psql.
 *
 * Se repara la cuenta de **quien llama**, y no la que se acaba de tocar, a
 * propósito: `exigirAdmin` acaba de comprobar contra la base que esa cuenta era
 * administradora y estaba activa, así que devolverle esos dos campos restaura un
 * estado que era cierto hace un instante y no concede nada a nadie. Restaurar en
 * cambio la cuenta editada sería un ascenso: en `actualizarUsuario` el objetivo
 * puede ser un lector al que solo se le estaba cambiando el rol a editor. Y un
 * borrado, además, no se deshace.
 *
 * La escritura va con `overrideAccess` y sin `user` porque la cuenta de quien
 * llama está desactivada justo en este momento, y el control de acceso de la
 * colección le negaría precisamente la escritura que arregla el estropicio.
 */
async function devolverElAdminSiNoQuedaNinguno(
  payload: Payload,
  usuarioId: string,
  aviso: string,
): Promise<void> {
  if ((await adminsActivos(payload)) > 0) return
  await payload.update({
    collection: 'usuarios',
    id: usuarioId,
    data: { rol: 'admin', activo: true },
    overrideAccess: true,
  })
  throw new Error(aviso)
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
    let quitaUnAdmin = false
    if (datos.rol !== undefined) {
      const nuevoRol = exigirRol(datos.rol)
      if (objetivo === usuarioId && nuevoRol !== 'admin') {
        throw new Error('No puede quitarse a sí mismo el rol de administrador.')
      }
      if (nuevoRol !== 'admin') {
        await exigirQueQuedeUnAdmin(payload, objetivo, 'cambiarle el rol')
        quitaUnAdmin = true
      }
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

    if (quitaUnAdmin) {
      await devolverElAdminSiNoQuedaNinguno(
        payload,
        usuarioId,
        'El rol sí se cambió, pero otra sesión desactivó su cuenta mientras tanto y la ' +
          'plataforma habría quedado sin ningún administrador: se reactivó la suya. Revise la ' +
          'lista antes de seguir.',
      )
    }
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

    if (!nuevoEstado) {
      await devolverElAdminSiNoQuedaNinguno(
        payload,
        usuarioId,
        'La cuenta sí se desactivó, pero otra sesión desactivó la suya al mismo tiempo y la ' +
          'plataforma habría quedado sin ningún administrador: se reactivó la suya. Revise la ' +
          'lista antes de seguir.',
      )
    }
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

    await devolverElAdminSiNoQuedaNinguno(
      payload,
      usuarioId,
      'La cuenta se eliminó, pero otra sesión desactivó la suya al mismo tiempo y la ' +
        'plataforma habría quedado sin ningún administrador: se reactivó la suya.',
    )
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

    // La misma dirección que arma `correoDeClaveNueva` en la colección, y con
    // el mismo recorte de la barra final. Son dos copias que se declaran como
    // una sola cosa —el comentario de `Usuarios.ts` dice que el panel entrega
    // ese mismo enlace—, y la barra doble se arregló allí y no aquí: con
    // `NEXT_PUBLIC_SERVER_URL=…/traumahub/`, esto devolvía
    // `…/traumahub//clave/<testigo>`, que no casa con la ruta `/clave/[testigo]`
    // y contesta con el 404 de otra página del servidor compartido. Como esta
    // instalación no tiene SMTP, el enlace del panel no es el camino
    // alternativo sino el único, y el testigo caduca en una hora.
    const base = (process.env.NEXT_PUBLIC_SERVER_URL || '').replace(/\/+$/, '')
    // Se comprueba **antes** de pedir el testigo: cada `forgotPassword` invalida
    // el anterior, así que fallar después dejaría sin efecto un enlace que a lo
    // mejor ya estaba entregado. Y sin dirección pública el enlace saldría como
    // `/clave/<testigo>`: una ruta relativa, sin origen y sin prefijo, que no
    // sirve para pegar en ningún mensaje. Una variable que falta se arregla; un
    // enlace mudo que nadie sabe por qué no funciona, no.
    if (!base) {
      throw new Error(
        'Falta configurar la dirección pública de la plataforma (NEXT_PUBLIC_SERVER_URL): ' +
          'sin ella no se puede armar un enlace que se pueda entregar.',
      )
    }

    const hayCorreo = Boolean(process.env.SMTP_HOST)
    const testigo = await payload.forgotPassword({
      collection: 'usuarios',
      data: { email: correo },
      disableEmail: !hayCorreo,
    })

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

    // La escritura masiva de Payload no lanza: captura el error de cada
    // documento, lo acumula en `errors` y sigue con el siguiente. Sin mirar ese
    // array, un éxito parcial sale por la puerta como total —«7 resueltos», en
    // verde— y los tres que quedaron no aparecen en ningún sitio: ni en la
    // pantalla, ni en el registro, porque `accion()` solo anota lo que lanza.
    // El administrador ve la bandeja recargarse con pendientes que acaba de
    // resolver y no tiene una pista de cuáles son ni por qué.
    const resueltos = resultado.docs?.length ?? 0
    const fallidos = resultado.errors ?? []
    if (fallidos.length > 0) {
      console.error('[panel] comentarios que no se pudieron resolver:', fallidos)
      throw new Error(
        `Se resolvieron ${resueltos}, pero ${fallidos.length} no. El primero falló así: ` +
          fallidos[0].message,
      )
    }
    return { resueltos }
  })
}
