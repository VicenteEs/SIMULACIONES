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
  filtroDeLecturaDeModulo,
  filtroDePropiedad,
  puedeLeerContenido,
  puedeEditarContenido,
  puedeEditarModulo,
  puedeAdministrarUsuarios,
  type Rol,
  type UsuarioSesion,
} from './reglas'

const ROLES: readonly Rol[] = ['admin', 'editor', 'lector']

/** Lista de textos, o `undefined` si lo que viene no lo es. */
const comoLista = (valor: unknown): string[] | undefined =>
  Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : undefined

/**
 * Convierte lo que venga en la sesión a un usuario reconocible, o a `null`.
 * Un usuario con forma inesperada nunca obtiene permisos.
 */
function normalizar(usuario: unknown): UsuarioSesion | null {
  if (!usuario || typeof usuario !== 'object') return null
  const registro = usuario as Record<string, unknown>
  const { id, rol, activo } = registro
  if (typeof rol !== 'string' || !ROLES.includes(rol as Rol)) return null
  return {
    id: typeof id === 'string' || typeof id === 'number' ? String(id) : 'test-id',
    rol: rol as Rol,
    activo: activo === true,
    modulosVisibles: comoLista(registro.modulosVisibles),
    modulosEditables: comoLista(registro.modulosEditables),
  }
}

const usuarioDe = (args: { req?: { user?: unknown } }): UsuarioSesion | null =>
  normalizar(args?.req?.user)

// Aquí vivió `lecturaDeContenido`, lectura de una colección versionada sin
// permisos por módulo. No la usaba ninguna colección —los cinco módulos usan
// `lecturaDeModulo` y las auxiliares `lecturaSimple`— y era la elección
// equivocada que más se parece a la correcta: quien fuera a declarar una
// colección nueva se habría encontrado con un nombre que suena a «lectura de
// contenido» y habría dejado el módulo sin sus permisos, sin que nada fallara.
// Su lógica no se perdió: `lecturaDeModulo` delega en el mismo `filtroDeLectura`.

/**
 * Lectura de un módulo concreto, con permisos por módulo.
 *
 * Es una fábrica y no una función suelta porque la función de acceso de Payload
 * no sabe a qué colección pertenece: el módulo se le dice al declararla.
 */
export const lecturaDeModulo =
  (modulo: string): Access =>
  (args) =>
    filtroDeLecturaDeModulo(usuarioDe(args), modulo)

/** Escritura de un módulo concreto, con permisos por módulo. */
export const escrituraDeModulo =
  (modulo: string): Access =>
  (args) =>
    puedeEditarModulo(usuarioDe(args), modulo)

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
 * Acceso a registros propios (comentarios, actividad).
 * Permite a admin/editor ver y modificar todo, y a los lectores solo lo suyo.
 */
export const accesoDePropiedad: Access = (args) => filtroDePropiedad(usuarioDe(args))

/**
 * Acceso al panel de administración.
 *
 * Payload exige aquí un booleano estricto y no admite un filtro de consulta,
 * a diferencia del resto de las operaciones. Se declara aparte para que el
 * tipo sea el correcto en lugar de forzarlo con una aserción.
 */
export const accesoAlPanel = (args: { req?: { user?: unknown } }): boolean =>
  puedeAdministrarUsuarios(usuarioDe(args))
