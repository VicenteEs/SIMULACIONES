/**
 * Adaptadores entre Payload y las reglas puras de `reglas.ts`.
 *
 * Payload entrega a cada función de acceso un objeto con la petición; aquí se
 * extrae el usuario, se normaliza y se delega en la regla correspondiente. Toda
 * la política vive en un solo lugar: si mañana cambia quién puede qué, se
 * cambia en `reglas.ts` y las colecciones no se tocan.
 */
import type { Access } from 'payload'
import {
  filtroDeLectura,
  puedeEditarContenido,
  puedeAdministrarUsuarios,
  type Rol,
  type UsuarioSesion,
} from './reglas'

const ROLES: readonly Rol[] = ['admin', 'editor', 'lector']

/**
 * Convierte lo que venga en la sesión a un usuario reconocible, o a `null`.
 * Un usuario con forma inesperada nunca obtiene permisos.
 */
function normalizar(usuario: unknown): UsuarioSesion | null {
  if (!usuario || typeof usuario !== 'object') return null
  const { rol, activo } = usuario as { rol?: unknown; activo?: unknown }
  if (typeof rol !== 'string' || !ROLES.includes(rol as Rol)) return null
  return { rol: rol as Rol, activo: activo === true }
}

const usuarioDe = (args: { req?: { user?: unknown } }): UsuarioSesion | null =>
  normalizar(args?.req?.user)

export const lecturaDeContenido: Access = (args) => filtroDeLectura(usuarioDe(args))

export const escrituraDeContenido: Access = (args) => puedeEditarContenido(usuarioDe(args))

export const administracionDeUsuarios: Access = (args) =>
  puedeAdministrarUsuarios(usuarioDe(args))
