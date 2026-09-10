/**
 * Guardias de las acciones de servidor.
 *
 * Una acción de servidor es un extremo HTTP con otro nombre: se puede invocar
 * sin pasar por la interfaz que la ofrece. Cada una empieza comprobando quién
 * llama, y esa comprobación vive aquí para que ninguna se olvide de hacerla de
 * la misma manera.
 *
 * Se usa `rolReal` y no el rol efectivo: la vista previa «ver como residente»
 * baja privilegios de lectura, pero nadie administra la plataforma desde una
 * simulación.
 */
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { SLUGS_DE_MODULOS } from '@/collections'
import { obtenerSesion } from '@/lib/sesion'

export class ErrorDeAcceso extends Error {}

export interface Contexto {
  payload: Payload
  usuario: Record<string, unknown>
  usuarioId: string
}

async function exigirRolReal(roles: readonly string[], mensaje: string): Promise<Contexto> {
  const { usuario, activo, rolReal } = await obtenerSesion()
  if (!usuario || !activo || !rolReal || !roles.includes(rolReal)) {
    throw new ErrorDeAcceso(mensaje)
  }
  return {
    payload: await getPayload({ config }),
    usuario,
    usuarioId: String(usuario.id),
  }
}

export const exigirAdmin = (): Promise<Contexto> =>
  exigirRolReal(['admin'], 'Acceso denegado: se requiere rol de administrador.')

export const exigirEditor = (): Promise<Contexto> =>
  exigirRolReal(['admin', 'editor'], 'Acceso denegado: se requiere rol de editor.')

/**
 * Igual que `exigirEditor`, pero además comprueba los permisos por módulo.
 *
 * Payload ya rechaza la escritura en una colección para la que el usuario no
 * tenga permiso, pero lo hace con un mensaje genérico y después de haber
 * empezado a trabajar. Comprobarlo aquí permite decir qué módulo es y no
 * intentar siquiera la escritura.
 */
export async function exigirEdicionDe(coleccion: string): Promise<Contexto> {
  const contexto = await exigirEditor()
  if (!puedeEditar(contexto.usuario, coleccion)) {
    throw new ErrorDeAcceso('Su cuenta no tiene permiso para editar este módulo.')
  }
  return contexto
}

/**
 * ¿Puede esta cuenta escribir en esta colección?
 *
 * Está aparte y sin efectos para que las **páginas** del panel puedan
 * preguntarlo igual que lo hacen las acciones. Sin esto, un editor restringido
 * veía el módulo ajeno en el listado, abría la ficha, la rellenaba entera y
 * solo al guardar se enteraba de que no le correspondía.
 *
 * Presupone un rol de escritura ya comprobado: contesta sobre el módulo, no
 * sobre si alguien es editor.
 */
export function puedeEditar(usuario: Record<string, unknown>, coleccion: string): boolean {
  if (usuario.rol === 'admin') return true

  const permitidos = usuario.modulosEditables
  const restringido = Array.isArray(permitidos) && permitidos.length > 0
  // Solo los cinco módulos admiten restricción; el material de apoyo lo usan
  // todos los módulos y separarlo por permisos dejaría fichas sin sus imágenes.
  //
  // La lista se toma de donde se declaran las colecciones y no se copia aquí.
  // Copiada, un módulo nuevo entraba sin restricción posible: quedaba fuera de
  // este `includes`, ningún permiso por módulo se le aplicaba y cualquier
  // editor podía escribirlo. Un permiso que falla abriendo no se nota.
  const esModulo = (SLUGS_DE_MODULOS as readonly string[]).includes(coleccion)
  return !(esModulo && restringido && !(permitidos as string[]).includes(coleccion))
}

/** Forma uniforme de respuesta de las acciones del panel. */
export interface Respuesta<T = unknown> {
  exito: boolean
  mensaje?: string
  datos?: T
}

/**
 * Envuelve una acción para que un fallo llegue al panel como mensaje y no como
 * excepción sin manejar. La interfaz puede así mostrar el motivo en lugar de
 * romperse, y el registro del servidor conserva el detalle.
 */
export async function accion<T>(tarea: () => Promise<T>): Promise<Respuesta<T>> {
  try {
    return { exito: true, datos: await tarea() }
  } catch (error: unknown) {
    const mensaje = error instanceof Error ? error.message : 'Error inesperado.'
    if (!(error instanceof ErrorDeAcceso)) console.error('[panel]', error)
    return { exito: false, mensaje }
  }
}
