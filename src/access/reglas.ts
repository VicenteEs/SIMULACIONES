/**
 * Reglas de acceso de la plataforma (decisión D-020).
 *
 * Nada es visible sin sesión y ninguna cuenta sirve hasta que un administrador
 * la activa. Estas funciones son puras a propósito: se prueban sin base de
 * datos y se reutilizan desde las colecciones, el middleware y las rutas de
 * API, de modo que las tres capas no puedan discrepar entre sí.
 */

export type Rol = 'admin' | 'editor' | 'lector'

export interface UsuarioSesion {
  rol: Rol
  activo: boolean
}

/** Filtro de Payload para restringir una consulta a lo publicado. */
export const SOLO_PUBLICADO = { _status: { equals: 'published' } } as const

/** Una cuenta sirve únicamente si existe y el administrador la activó. */
const habilitada = (u: UsuarioSesion | null | undefined): u is UsuarioSesion =>
  Boolean(u && u.activo)

export const puedeLeerContenido = (u: UsuarioSesion | null | undefined): boolean =>
  habilitada(u)

export const puedeEditarContenido = (u: UsuarioSesion | null | undefined): boolean =>
  habilitada(u) && (u.rol === 'admin' || u.rol === 'editor')

/**
 * Crear y activar cuentas queda reservado al administrador: el traumatólogo
 * redacta contenido, no gestiona el acceso de nadie.
 */
export const puedeAdministrarUsuarios = (u: UsuarioSesion | null | undefined): boolean =>
  habilitada(u) && u.rol === 'admin'

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
