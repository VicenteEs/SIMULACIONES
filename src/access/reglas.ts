/**
 * Reglas de acceso de la plataforma (decisión D-020).
 *
 * Nada es visible sin sesión y ninguna cuenta sirve hasta que un administrador
 * la activa. Estas funciones son puras a propósito: se prueban sin base de
 * datos y se reutilizan desde las colecciones, el panel y las acciones de
 * servidor, de modo que las tres capas no puedan discrepar entre sí.
 *
 * Sobre el rol hay una segunda capa, opcional, de permisos por módulo. El rol
 * dice *qué clase* de cosas puede hacer alguien; los permisos, *sobre qué
 * módulos*. Se resuelven siempre en este orden y la capa de módulos solo
 * restringe, nunca amplía: un lector con «todos los módulos» sigue sin poder
 * escribir nada.
 */

export type Rol = 'admin' | 'editor' | 'lector'

/** Los cinco módulos, repetidos aquí para que este archivo no dependa de nada. */
export type Modulo = 'patologias' | 'maniobras' | 'casos-ao' | 'cirugias' | 'estudios-ia'

export interface UsuarioSesion {
  id: string
  rol: Rol
  activo: boolean
  /**
   * Módulos que esta cuenta puede leer. Vacío o ausente significa **todos**:
   * es el caso normal, y obliga a que restringir sea un acto deliberado.
   */
  modulosVisibles?: string[]
  /** Módulos que puede editar. Solo tiene efecto sobre un editor. */
  modulosEditables?: string[]
}

/** Filtro de Payload para restringir una consulta a lo publicado. */
export const SOLO_PUBLICADO = { _status: { equals: 'published' } } as const

/** Una cuenta sirve únicamente si existe y el administrador la activó. */
const habilitada = (u: UsuarioSesion | null | undefined): u is UsuarioSesion =>
  Boolean(u && u.activo)

/**
 * ¿La lista de módulos permite este?
 *
 * Una lista vacía o ausente no significa «ninguno» sino «sin restricción». Es
 * la interpretación que evita el fallo más probable: crear una cuenta, olvidar
 * marcarle módulos y que no vea nada sin que se entienda por qué.
 */
const permite = (lista: string[] | undefined, modulo: string): boolean =>
  !Array.isArray(lista) || lista.length === 0 || lista.includes(modulo)

export const puedeLeerContenido = (u: UsuarioSesion | null | undefined): boolean => habilitada(u)

export const puedeEditarContenido = (u: UsuarioSesion | null | undefined): boolean =>
  habilitada(u) && (u.rol === 'admin' || u.rol === 'editor')

/**
 * Crear y activar cuentas queda reservado al administrador: el traumatólogo
 * redacta contenido, no gestiona el acceso de nadie.
 */
export const puedeAdministrarUsuarios = (u: UsuarioSesion | null | undefined): boolean =>
  habilitada(u) && u.rol === 'admin'

/** ¿Puede esta cuenta ver el módulo indicado? El administrador siempre puede. */
export const puedeVerModulo = (u: UsuarioSesion | null | undefined, modulo: string): boolean => {
  if (!habilitada(u)) return false
  if (u.rol === 'admin') return true
  return permite(u.modulosVisibles, modulo)
}

/** ¿Puede escribir en el módulo indicado? */
export const puedeEditarModulo = (u: UsuarioSesion | null | undefined, modulo: string): boolean => {
  if (!puedeEditarContenido(u)) return false
  if (u!.rol === 'admin') return true
  return permite(u!.modulosEditables, modulo)
}

/**
 * Filtro de lectura por rol.
 *
 * Devuelve `false` para negar todo, `true` para no restringir, o una condición
 * que Payload aplica a la consulta. El lector nunca alcanza un borrador: eso lo
 * decide la consulta, no la interfaz.
 */
export const filtroDeLectura = (
  u: UsuarioSesion | null | undefined,
): boolean | typeof SOLO_PUBLICADO => {
  if (!habilitada(u)) return false
  if (u.rol === 'admin' || u.rol === 'editor') return true
  return SOLO_PUBLICADO
}

/**
 * Filtro de lectura de un módulo concreto.
 *
 * Igual que el anterior, pero además comprueba que la cuenta tenga ese módulo
 * entre los suyos. Sin permisos por módulo configurados se comporta
 * exactamente como `filtroDeLectura`, que es el caso normal.
 */
export const filtroDeLecturaDeModulo = (
  u: UsuarioSesion | null | undefined,
  modulo: string,
): boolean | typeof SOLO_PUBLICADO => {
  if (!puedeVerModulo(u, modulo)) return false
  return filtroDeLectura(u)
}

/**
 * Filtro para registros que pertenecen a un usuario (ej. comentarios, actividad).
 * Admin/editor acceden a todos; el lector solo a los suyos.
 */
export const filtroDePropiedad = (
  u: UsuarioSesion | null | undefined,
): boolean | { usuario: { equals: string } } => {
  if (!habilitada(u)) return false
  if (u.rol === 'admin' || u.rol === 'editor') return true
  return { usuario: { equals: u.id } }
}
