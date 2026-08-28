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
  puedeLeerContenido,
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

/**
 * Lectura de una colección **versionada**.
 *
 * Devuelve un filtro que deja fuera los borradores para el lector. Ese filtro
 * consulta la columna `_status`, que solo existe donde hay borradores
 * activados: usarlo en una colección sin versiones rompe la consulta con
 * «Cannot find field for path at _status». Para esas, ver `lecturaSimple`.
 */
export const lecturaDeContenido: Access = (args) => filtroDeLectura(usuarioDe(args))

/**
 * Lectura de una colección **sin versiones** (segmentos, medios, modelos).
 *
 * Exige lo mismo —sesión con cuenta activa— pero responde con un booleano, sin
 * filtrar por estado de publicación, porque en estas colecciones no existe tal
 * estado. El invariante de `tests/unit/colecciones.test.ts` impide que se
 * vuelvan a confundir.
 */
export const lecturaSimple: Access = (args) => puedeLeerContenido(usuarioDe(args))

export const escrituraDeContenido: Access = (args) => puedeEditarContenido(usuarioDe(args))

export const administracionDeUsuarios: Access = (args) =>
  puedeAdministrarUsuarios(usuarioDe(args))

/**
 * Acceso al panel de administración.
 *
 * Payload exige aquí un booleano estricto y no admite un filtro de consulta,
 * a diferencia del resto de las operaciones. Se declara aparte para que el
 * tipo sea el correcto en lugar de forzarlo con una aserción.
 */
export const accesoAlPanel = (args: { req?: { user?: unknown } }): boolean =>
  puedeAdministrarUsuarios(usuarioDe(args))
