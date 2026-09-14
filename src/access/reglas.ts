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

// La lista de módulos no se repite aquí. Estuvo, sin que nadie la usara, y una
// lista sin lector es una lista que se queda atrás sin que nada lo note. La
// única está en `src/collections/index.ts` (SLUGS_DE_MODULOS), junto a las
// colecciones que la definen. Este archivo sigue sin depender de nada porque
// trabaja con `string` y solo pregunta si una lista contiene un módulo.

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

/**
 * ¿Puede escribir en el módulo indicado?
 *
 * Editar un módulo exige verlo. Miraba solo `modulosEditables`, y como una
 * lista vacía ahí es «todos», el editor al que un administrador dejó ver
 * únicamente «patologías» —sin tocarle la edición, que es lo que el modal de
 * permisos de la ficha de la cuenta deja guardar— recibía 403 al listar
 * cirugías y, a la vez, leía sus borradores por `findVersions`, las reescribía,
 * las publicaba y las borraba. Todo lo que cuelga de esta función —la escritura
 * y `readVersions` de los cinco módulos, la de los catálogos del simulador y el
 * filtro de lectura de borradores— heredaba la puerta abierta. Lo demostró
 * `tests/integration/roles.test.ts` con el actor `editorSinVer`.
 *
 * Así la capa de módulos cumple lo que promete la cabecera: restringir una de
 * las dos listas nunca amplía lo que permite la otra.
 */
export const puedeEditarModulo = (u: UsuarioSesion | null | undefined, modulo: string): boolean => {
  if (!puedeEditarContenido(u)) return false
  if (u!.rol === 'admin') return true
  return permite(u!.modulosVisibles, modulo) && permite(u!.modulosEditables, modulo)
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
 * Comprueba que la cuenta tenga ese módulo entre los visibles y, dentro, le
 * deja los borradores solo a quien puede **editar** ese módulo. Sin permisos
 * por módulo configurados se comporta exactamente como `filtroDeLectura`, que
 * es el caso normal.
 *
 * Delegaba en `filtroDeLectura`, que mira el rol y nada más: todo editor
 * recibía `true`. Con eso, el editor al que un administrador dejó solo en
 * «patologías» leía el borrador entero de cualquier cirugía —por un `find`
 * corriente, por `draft: true` y por `findByID`—, mientras `readVersions` de la
 * misma colección se lo negaba (`lecturaDeBorradores`). Dos puertas al mismo
 * texto con dos respuestas distintas, y la abierta era la que usan las páginas:
 * el simulador le pintaba la lista con la etiqueta «Borrador». Lo demostró
 * `tests/integration/roles.test.ts` contra la base.
 *
 * La regla que se sostiene es la de `lecturaDeBorradores`: un borrador lo lee
 * quien lo puede editar. Lo publicado lo sigue leyendo entero, porque
 * restringir la edición no restringe la lectura (esa es `modulosVisibles`).
 */
export const filtroDeLecturaDeModulo = (
  u: UsuarioSesion | null | undefined,
  modulo: string,
): boolean | typeof SOLO_PUBLICADO => {
  if (!puedeVerModulo(u, modulo)) return false
  return puedeEditarModulo(u, modulo) ? true : SOLO_PUBLICADO
}

/**
 * Filtro para registros que pertenecen a un usuario y que atiende quien cuida
 * el contenido: hoy, los comentarios. Admin/editor acceden a todos; el lector
 * solo a los suyos. La actividad no va por aquí: ver `filtroDeSeguimiento`.
 */
export const filtroDePropiedad = (
  u: UsuarioSesion | null | undefined,
): boolean | { usuario: { equals: string } } => {
  if (!habilitada(u)) return false
  if (u.rol === 'admin' || u.rol === 'editor') return true
  return { usuario: { equals: u.id } }
}

/**
 * Filtro del seguimiento de lectura (`actividad`): el administrador alcanza las
 * filas de todos; cualquier otra cuenta, solo las suyas.
 *
 * Es distinto de `filtroDePropiedad` a propósito. Los comentarios los atiende
 * quien cuida el contenido —la bandeja del panel es de editor—, pero el
 * progreso de cada residente es seguimiento, y las dos pantallas que lo enseñan
 * (actividad y estadísticas) exigen `exigirPanel('admin')` (D-051). Con
 * `filtroDePropiedad`, un editor leía el historial de lectura y el puntaje del
 * simulador de todos los residentes, y además podía **reescribirlos**: marcar
 * como leída la ficha de otro o cambiarle el puntaje de un caso. Nada de eso es
 * editar contenido. Lo demostró `tests/integration/roles.test.ts`.
 *
 * El editor conserva sus propias filas: también lee fichas y juega casos.
 */
export const filtroDeSeguimiento = (
  u: UsuarioSesion | null | undefined,
): boolean | { usuario: { equals: string } } => {
  if (!habilitada(u)) return false
  if (u.rol === 'admin') return true
  return { usuario: { equals: u.id } }
}
