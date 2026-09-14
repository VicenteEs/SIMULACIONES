/**
 * Adaptadores entre Payload y las reglas puras de `reglas.ts`.
 *
 * Payload entrega a cada función de acceso un objeto con la petición; aquí se
 * extrae el usuario, se normaliza y se delega en la regla correspondiente. Toda
 * la política vive en un solo lugar: si mañana cambia quién puede qué, se
 * cambia en `reglas.ts` y las colecciones no se tocan.
 */
import type { Access, FieldAccess } from 'payload'
import {
  filtroDeLecturaDeModulo,
  filtroDePropiedad,
  filtroDeSeguimiento,
  puedeLeerContenido,
  puedeEditarContenido,
  puedeEditarModulo,
  puedeVerModulo,
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
 *
 * Exportada porque las acciones de servidor también tienen que preguntar a
 * `reglas.ts` —`anotar` y `crearComentario`, por el módulo visible—, y lo que
 * les llega de `obtenerSesion` es el documento de Payload (`id` numérico,
 * `activo` que puede ser `null`), no un `UsuarioSesion`. Cada copia de esta
 * conversión escrita a mano era una ocasión de dar `activo: true` a quien no lo
 * tiene; la de `Actividad.ts` ya se había quedado sin mirar el rol.
 */
export function usuarioDeSesion(usuario: unknown): UsuarioSesion | null {
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
  usuarioDeSesion(args?.req?.user)

// Aquí vivió `lecturaDeContenido`, lectura de una colección versionada sin
// permisos por módulo. No la usaba ninguna colección —los cinco módulos usan
// `lecturaDeModulo` y las auxiliares `lecturaSimple`— y era la elección
// equivocada que más se parece a la correcta: quien fuera a declarar una
// colección nueva se habría encontrado con un nombre que suena a «lectura de
// contenido» y habría dejado el módulo sin sus permisos, sin que nada fallara.
// Su lógica no se perdió, y la de ahora es más estrecha: `lecturaDeModulo`
// delega en `filtroDeLecturaDeModulo`, que además de mirar el rol pregunta si la
// cuenta puede editar ese módulo antes de enseñarle un borrador.

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
 * Lectura de las **versiones** de un módulo: los borradores.
 *
 * Hay que declararla. Payload, cuando una colección no la declara, no hereda su
 * regla de lectura: `executeAccess` recibe `undefined` y devuelve `true` para
 * **cualquier sesión iniciada**. Es decir, `/api/cirugias/versions` entregaba el
 * texto íntegro de todo lo no publicado a un residente con solo abrir la
 * consola del navegador, saltándose a la vez el filtro de «solo publicado» y el
 * de permisos por módulo.
 *
 * Un borrador es trabajo a medio escribir. Lo puede leer quien lo puede editar,
 * y nadie más.
 */
export const lecturaDeBorradores =
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

/**
 * Lo mismo que `escrituraDeContenido`, pero para un **campo**.
 *
 * Hacen falta las dos porque Payload no comparte el tipo: `Access` puede
 * devolver un filtro de consulta y `FieldAccess` solo un booleano, así que una
 * colección no puede reutilizar la de arriba en `field.access` aunque la
 * política sea idéntica. La política, que es lo que importa, sigue estando una
 * sola vez: las dos delegan en `puedeEditarContenido`.
 *
 * Se usa donde un campo lo mantiene quien cuida el contenido y nadie más —el
 * `estado` de un comentario, hoy—. Vivió como constante local en
 * `Comentarios.ts`, y funcionaba; pero este archivo promete concentrar toda la
 * política en un sitio, y una regla suelta dentro de una colección es la copia
 * que se queda atrás el día que la de aquí cambie.
 *
 * Mira `activo` porque `puedeEditarContenido` lo mira: el acceso de colección
 * ya lo exige, pero una regla de campo que no lo comprobara sería una
 * divergencia esperando a que alguien afloje la de arriba.
 */
export const mantenimientoDeContenido: FieldAccess = (args) =>
  puedeEditarContenido(usuarioDe(args))

export const administracionDeUsuarios: Access = (args) =>
  puedeAdministrarUsuarios(usuarioDe(args))

/**
 * Acceso a registros propios (comentarios, actividad).
 * Permite a admin/editor ver y modificar todo, y a los lectores solo lo suyo.
 */
export const accesoDePropiedad: Access = (args) => filtroDePropiedad(usuarioDe(args))

/**
 * Acceso a las filas de seguimiento (`actividad`): el administrador, todas;
 * cualquier otra cuenta, las suyas. El porqué, en `filtroDeSeguimiento`.
 */
export const accesoDeSeguimiento: Access = (args) => filtroDeSeguimiento(usuarioDe(args))

/**
 * Crear una fila que cuelga de un módulo exige poder ver ese módulo.
 *
 * La comparten `actividad` y `comentarios`, y viene de `Actividad.ts`, donde
 * vivía como `CREACION_DEL_MODULO_PROPIO` con un aviso de que se mudaría aquí en
 * cuanto este archivo se pudiera tocar. Se muda ahora porque hacía falta en una
 * segunda colección: `comentarios` solo pedía una cuenta activa, así que la
 * kinesióloga con el simulador vetado comentaba igual una cirugía que no puede
 * abrir, y el comentario le llegaba al traumatólogo desde un módulo que para
 * ella no existe. Copiarla habría dejado dos reglas iguales esperando a
 * separarse.
 *
 * Por qué se niega a la cuenta sin activar, a la sesión ausente y a la fila sin
 * módulo, y por qué el administrador pasa aunque tenga módulos marcados: lo dice
 * `puedeVerModulo`, que es a quien se le pregunta. Sin `coleccion` no hay nada
 * que autorizar: el campo es obligatorio en las dos colecciones.
 *
 * Solo actúa cuando alguien escribe con `overrideAccess: false`. El panel y las
 * acciones de servidor escriben por la API local, donde vale `true` por
 * omisión: por eso `anotar` y `crearComentario` hacen la misma pregunta antes de
 * tocar la base, a esta misma regla y no a una suya.
 */
export const creacionEnModuloVisible: Access = ({ req, data }) => {
  const modulo = (data as { coleccion?: unknown } | undefined)?.coleccion
  if (typeof modulo !== 'string') return false
  return puedeVerModulo(usuarioDe({ req }), modulo)
}

/**
 * Un campo que solo reescribe quien escribió la fila: el texto de un comentario.
 *
 * Es de campo y no de colección porque la colección tiene que seguir dejando al
 * editor tocar la fila —marca el comentario como resuelto—, y lo que no puede
 * es cambiar lo que dice. `usuario` está cerrado para todos
 * (`FIJADO_AL_CREAR`), así que el comentario se seguía enseñando en el panel
 * con el nombre y el correo del residente y con las palabras que hubiera
 * querido poner otro: una observación clínica firmada por quien no la hizo.
 * Tampoco el administrador: si un comentario sobra, se borra, y el borrado sí
 * es suyo.
 *
 * `doc` es el documento tal como estaba antes de la escritura, y su `usuario`
 * llega como identificador o poblado según la profundidad; se comparan como
 * texto porque PostgreSQL entrega números y la sesión puede traerlos igual. Un
 * comentario anonimizado por la baja de su autor (`usuario: null`) ya no lo
 * reescribe nadie.
 */
export const soloSuAutor: FieldAccess = ({ req, doc }) => {
  const sesion = usuarioDe({ req })
  if (!sesion || !sesion.activo) return false
  const autor = (doc as { usuario?: unknown } | undefined)?.usuario
  const idDelAutor = autor && typeof autor === 'object' ? (autor as { id?: unknown }).id : autor
  return idDelAutor !== null && idDelAutor !== undefined && String(idDelAutor) === sesion.id
}

/**
 * Acceso al panel de administración.
 *
 * Payload exige aquí un booleano estricto y no admite un filtro de consulta,
 * a diferencia del resto de las operaciones. Se declara aparte para que el
 * tipo sea el correcto en lugar de forzarlo con una aserción.
 */
export const accesoAlPanel = (args: { req?: { user?: unknown } }): boolean =>
  puedeAdministrarUsuarios(usuarioDe(args))
