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
  if (usuario.rol === 'admin') return true

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
  return !(esModulo && restringido && !(permitidos as string[]).includes(modulo))
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
