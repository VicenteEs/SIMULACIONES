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
import { CATALOGOS_DEL_SIMULADOR } from '@/collections/catalogos'
import { ESQUEMAS } from '@/admin/esquema'
import { obtenerSesion, type Sesion } from '@/lib/sesion'
import { MENSAJE_DE_OTRA_ENTRADA } from '@/lib/entradas'
import { idDeInstitucion } from '@/access/payload'
import { COLECCIONES_CON_INSTITUCION } from '@/collections/hooks/marcaDeInstitucion'
import { payloadDelLugar } from '@/lib/payloadDelLugar'

const COLECCIONES_SOLO_ADMIN: ReadonlySet<string> = new Set(
  ESQUEMAS.filter((e) => e.soloAdmin).map((e) => e.slug),
)

export class ErrorDeAcceso extends Error {}

/**
 * Lo que se le dice a quien llama sin sesión: lo de siempre, salvo que la haya
 * perdido porque se entró con su cuenta en otro equipo (D-388). Ahí «Acceso
 * denegado» suena a permisos, y lo que pasó es otra cosa que tiene arreglo.
 */
export const mensajeSinSesion = (sesion: Pick<Sesion, 'usuario' | 'cierre'>, mensaje: string): string =>
  !sesion.usuario && sesion.cierre === 'otra-entrada' ? MENSAJE_DE_OTRA_ENTRADA : mensaje

/**
 * El lugar donde trabaja una cuenta: su institución, o `null` si es de
 * TraumaHub (D-396). Sobre el documento de la sesión, que la trae como número
 * o poblada.
 *
 * En una sola función porque el fantasma (E5.9) lo cambiará: el administrador
 * de TraumaHub que entra a una institución trabajará en ella sin ser de ella.
 */
export const lugarDeLaCuenta = (usuario: Record<string, unknown>): string | null => idDeInstitucion(usuario.institucion)

export interface Contexto {
  /**
   * Recortado al lugar de quien llama (`payloadDelLugar`, D-401): lo que lea
   * de una colección con marca es solo de su lugar, y lo que escriba, también.
   * Las guardias de TraumaHub (`exigirAdminCentral`, `exigirEditorCentral`)
   * dan el de toda la plataforma, porque lo que hacen es de toda ella.
   */
  payload: Payload
  usuario: Record<string, unknown>
  usuarioId: string
  /** `lugarDeLaCuenta` de quien llama. */
  lugar: string | null
}

async function exigirRolReal(roles: readonly string[], mensaje: string): Promise<Contexto> {
  const sesion = await obtenerSesion()
  const { usuario, activo, rolReal } = sesion
  if (!usuario || !activo || !rolReal || !roles.includes(rolReal)) {
    throw new ErrorDeAcceso(mensajeSinSesion(sesion, mensaje))
  }
  // Recortado aquí y no en cada acción: las acciones leen con
  // `overrideAccess: true`, y cada una que se olvidara de filtrar dejaría a un
  // administrador de institución tocar las cuentas de otra con solo cambiar el
  // identificador que manda el navegador.
  const lugar = lugarDeLaCuenta(usuario)
  return {
    payload: payloadDelLugar(await getPayload({ config }), lugar),
    usuario,
    usuarioId: String(usuario.id),
    lugar,
  }
}

export const exigirAdmin = (): Promise<Contexto> =>
  exigirRolReal(['admin'], 'Acceso denegado: se requiere rol de administrador.')

export const exigirEditor = (): Promise<Contexto> =>
  exigirRolReal(['admin', 'editor'], 'Acceso denegado: se requiere rol de editor.')

/**
 * ¿Es una cuenta de TraumaHub y no de una institución (D-396)? Sobre el
 * documento de la sesión, que trae la institución como número o poblada.
 *
 * Los roles de institución son los de siempre con la marca puesta: su
 * administrador es `admin` y pasa `exigirAdmin`. Lo que es solo de TraumaHub
 * pregunta esto además del rol.
 */
export const esDeTraumaHub = (usuario: Record<string, unknown>): boolean =>
  idDeInstitucion(usuario.institucion) === null

const MENSAJE_SOLO_CENTRAL = 'Acceso denegado: esto lo administra el equipo de TraumaHub.'

async function exigirCentral(contexto: Promise<Contexto>): Promise<Contexto> {
  const listo = await contexto
  if (!esDeTraumaHub(listo.usuario)) throw new ErrorDeAcceso(MENSAJE_SOLO_CENTRAL)
  // Sin recortar: crear una institución mira si el correo ya tiene cuenta en
  // cualquiera, la difusión llega a todas y los comentarios de todas vienen a
  // TraumaHub (D-371). Recortado a la central, nada de eso funcionaría.
  return { ...listo, payload: await getPayload({ config }) }
}

/**
 * Lo que es de toda la plataforma y no de una institución: los respaldos, el
 * sistema, la difusión, la portada, las cotizaciones, la mantención de los
 * módulos (P-016 E5.3). Un administrador de institución no pasa.
 */
export const exigirAdminCentral = (): Promise<Contexto> => exigirCentral(exigirAdmin())

/**
 * Lo que edita el catálogo común: el taller del atlas, las estructuras, el
 * instrumental, el buzón de requisitos. Lo usan todas las instituciones y no es
 * de ninguna, así que solo lo escribe TraumaHub (D-396).
 */
export const exigirEditorCentral = (): Promise<Contexto> => exigirCentral(exigirEditor())

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
 * Los catálogos del simulador se gobiernan con el permiso de su módulo.
 *
 * No son un módulo: no tienen página propia, ni entrada en la barra, ni casilla
 * que marcar en la ficha de la cuenta. Son el **vocabulario** del módulo 04, y
 * `catalogos.ts` ya los escribe con `escrituraDeModulo('cirugias')`.
 *
 * Aquella declaración gobierna la API REST; esta gobierna el panel, que es la
 * puerta por la que se entra de verdad. El panel escribe con la API local,
 * cuyo `overrideAccess` vale `true` por omisión, así que las funciones de
 * `access` de la colección ni se consultan: lo único que le pregunta algo es
 * `exigirEdicionDe` → `puedeEditar`. Sin esta tabla, el editor apartado del
 * simulador no podía tocar un instrumento con `curl` pero seguía borrándolo
 * desde el panel, y borrar uno deja a nulo el campo `instrumento` de cada paso
 * que lo pedía: ese paso ya no se puede superar y el caso se queda sin salida.
 *
 * Va aparte de `SLUGS_DE_MODULOS` a propósito. Meter los cinco catálogos en esa
 * lista los convertiría en módulos para todo lo demás que la consulta —la barra
 * de navegación, la portada, las opciones de permisos de una cuenta nueva— y
 * aparecerían cinco entradas que no llevan a ninguna parte.
 *
 * La lista sale de donde se declaran los catálogos y no se copia aquí, por el
 * mismo motivo que la de módulos: copiada, el catálogo que se añada mañana
 * quedaría fuera y cualquier editor podría escribirlo.
 */
const MODULO_DEL_VOCABULARIO: Record<string, string> = Object.fromEntries(
  // El `as const` no es adorno: sin él `map` devuelve `string[][]` y
  // `Object.fromEntries` cae en su sobrecarga que devuelve `any`, con lo que
  // una errata en esta línea dejaría de verse al compilar.
  CATALOGOS_DEL_SIMULADOR.map((catalogo) => [catalogo.slug, 'cirugias'] as const),
)

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
  // Una cuenta de institución escribe solo en las colecciones que llevan la
  // marca (D-396): una fila sin marca es de TraumaHub, y el gancho le pondría
  // la suya a lo que creara en un catálogo que es de todos. Antes que el
  // administrador, porque el de una institución también es `admin`.
  if (!esDeTraumaHub(usuario) && !(COLECCIONES_CON_INSTITUCION as readonly string[]).includes(coleccion)) return false
  if (usuario.rol === 'admin') return true
  // Las colecciones reservadas al administrador (el equipo del inicio) no se abren a ningún editor, ni con la lista de
  // módulos vacía, que en un módulo significa «todos». Se lee del esquema del panel y no de una lista aparte, por lo
  // mismo que arriba: una copia que se queda atrás no falla, deja la puerta abierta.
  if (COLECCIONES_SOLO_ADMIN.has(coleccion)) return false

  const permitidos = usuario.modulosEditables
  const restringido = Array.isArray(permitidos) && permitidos.length > 0
  // Admiten restricción los cinco módulos y el vocabulario que cuelga de uno de
  // ellos. El material de apoyo —medios, modelos 3D, segmentos— no: lo usan los
  // cinco módulos a la vez y separarlo por permisos dejaría fichas ajenas sin
  // sus imágenes.
  //
  // Las dos listas se toman de donde se declaran las colecciones y no se copian
  // aquí. Copiadas, una colección nueva entraba sin restricción posible:
  // quedaba fuera de este `includes`, ningún permiso por módulo se le aplicaba
  // y cualquier editor podía escribirla. Un permiso que falla abriendo no se
  // nota.
  const modulo = MODULO_DEL_VOCABULARIO[coleccion] ?? coleccion
  const esModulo = (SLUGS_DE_MODULOS as readonly string[]).includes(modulo)
  // Y un módulo que la cuenta no ve tampoco lo edita, aunque su lista de
  // editables esté vacía («todos»). Sin esto, el editor al que solo se le
  // restringió la lectura no podía abrir una cirugía en la plataforma pero sí
  // listarla, reescribirla y borrarla desde el panel, que escribe con
  // `overrideAccess: true` y solo pregunta aquí. Es la misma regla que
  // `puedeEditarModulo` en `src/access/reglas.ts`, que gobierna la base.
  const visibles = usuario.modulosVisibles
  const oculto =
    esModulo && Array.isArray(visibles) && visibles.length > 0 && !(visibles as string[]).includes(modulo)
  return !(oculto || (esModulo && restringido && !(permitidos as string[]).includes(modulo)))
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
