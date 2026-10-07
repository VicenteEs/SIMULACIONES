/**
 * Validación de lo que llega desde el navegador.
 *
 * Las acciones de servidor de Next se invocan por HTTP: cualquiera con sesión
 * puede llamarlas con los argumentos que quiera, aunque el formulario que las
 * usa ofrezca un desplegable con tres opciones. Por eso todo argumento se
 * comprueba aquí antes de tocar la base, y no se confía en el tipo declarado en
 * TypeScript, que no existe en tiempo de ejecución.
 */

import { SLUGS_DE_MODULOS } from '@/collections'
import type { Rol } from '@/access/reglas'

export type SlugDeModulo = (typeof SLUGS_DE_MODULOS)[number]

const ROLES: readonly Rol[] = ['admin', 'editor', 'lector']

/** Longitud máxima de un comentario. Suficiente para una observación clínica. */
export const LARGO_MAXIMO_COMENTARIO = 4000

export class ErrorDeValidacion extends Error {}

/** Aborta con un mensaje en español, legible para quien usa el panel. */
function rechazar(mensaje: string): never {
  throw new ErrorDeValidacion(mensaje)
}

export const esSlugDeModulo = (valor: unknown): valor is SlugDeModulo =>
  typeof valor === 'string' && (SLUGS_DE_MODULOS as readonly string[]).includes(valor)

export const esRol = (valor: unknown): valor is Rol =>
  typeof valor === 'string' && (ROLES as readonly string[]).includes(valor)

export function exigirSlugDeModulo(valor: unknown): SlugDeModulo {
  if (!esSlugDeModulo(valor)) rechazar('El módulo indicado no existe.')
  return valor
}

export function exigirRol(valor: unknown): Rol {
  if (!esRol(valor)) rechazar('El rol indicado no existe.')
  return valor
}

/**
 * Identificador de documento. PostgreSQL entrega enteros, pero el navegador los
 * devuelve como texto; se acepta cualquiera de los dos y se normaliza a texto.
 */
export function exigirIdentificador(valor: unknown, que = 'El identificador'): string {
  if (typeof valor === 'number' && Number.isInteger(valor) && valor > 0) return String(valor)
  if (typeof valor === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(valor)) return valor
  return rechazar(`${que} no es válido.`)
}

/** Texto obligatorio, sin espacios sobrantes y con techo de longitud. */
export function exigirTexto(valor: unknown, que: string, maximo: number): string {
  if (typeof valor !== 'string') rechazar(`${que} es obligatorio.`)
  const limpio = valor.trim()
  if (limpio.length === 0) rechazar(`${que} no puede quedar vacío.`)
  if (limpio.length > maximo) rechazar(`${que} no puede superar los ${maximo} caracteres.`)
  return limpio
}

/** Texto opcional: devuelve `undefined` si viene vacío. */
export function textoOpcional(valor: unknown, que: string, maximo: number): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined
  return exigirTexto(valor, que, maximo)
}

/**
 * Correo electrónico. La comprobación es deliberadamente laxa —una arroba y un
 * punto detrás—: validar direcciones con una expresión estricta rechaza
 * direcciones legítimas y no impide ninguna falsa. Quien decide si el correo
 * existe es el correo que se le envía.
 */
export function exigirCorreo(valor: unknown): string {
  const texto = exigirTexto(valor, 'El correo', 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) rechazar('El correo no tiene un formato válido.')
  return texto
}

/**
 * Contraseña inicial. Doce caracteres es más de lo que pide Payload y menos de
 * lo que nadie está dispuesto a teclear: el mínimo razonable para una cuenta
 * que da acceso a todo el contenido.
 */
export function exigirContrasena(valor: unknown): string {
  if (typeof valor !== 'string') rechazar('La contraseña es obligatoria.')
  if (valor.length < 12) rechazar('La contraseña debe tener al menos 12 caracteres.')
  if (valor.length > 200) rechazar('La contraseña es demasiado larga.')
  return valor
}

/**
 * Escapa un texto para incrustarlo en HTML.
 *
 * Se usa en los correos de aviso: el comentario lo escribe un usuario y va
 * dentro de un cuerpo HTML. Sin esto, un comentario con etiquetas llega al
 * administrador convertido en marcado.
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Lista de modulos validos, para los permisos por modulo.
 *
 * Todo lo que no sea uno de los cinco se descarta en silencio en lugar de
 * rechazar la operacion entera: la lista viene de casillas de la interfaz, y un
 * valor raro entre cinco correctos no debe impedir guardar los otros cuatro.
 */
export function modulosValidos(valor: unknown): SlugDeModulo[] {
  if (!Array.isArray(valor)) return []
  const vistos = new Set<string>()
  for (const bruto of valor) {
    if (esSlugDeModulo(bruto)) vistos.add(bruto)
  }
  return [...vistos] as SlugDeModulo[]
}

// ------------------------------------------- destino y ancla de un comentario

/**
 * Sobre qué se puede comentar: los cinco módulos y, desde D-158, una
 * preparación del taller anatómico.
 *
 * El taller no es un módulo, así que no entra en `SLUGS_DE_MODULOS` —eso lo
 * convertiría en una entrada más de la barra, de la portada y de los permisos de
 * cada cuenta—, y por eso las acciones de comentarios ya no pueden validar con
 * `exigirSlugDeModulo` a secas.
 */
export const DESTINO_TALLER = 'instancias-atlas'
export type DestinoDeComentario = SlugDeModulo | typeof DESTINO_TALLER

export const esDestinoDeComentario = (valor: unknown): valor is DestinoDeComentario =>
  valor === DESTINO_TALLER || esSlugDeModulo(valor)

export function exigirDestinoDeComentario(valor: unknown): DestinoDeComentario {
  if (!esDestinoDeComentario(valor)) rechazar('Eso no se puede comentar.')
  return valor
}

/** Dónde está lo que se comenta, dentro de una preparación. Ver `Comentarios.ts`. */
export interface AnclaDeComentario {
  pieza: string
  punto?: [number, number, number]
  vista?: { camara: [number, number, number]; objetivo: [number, number, number] }
}

const esVector = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e6)

/**
 * El ancla de un comentario, comprobada y reconstruida campo a campo.
 *
 * Se reconstruye y no se pasa tal cual: lo que llega es lo que el navegador
 * quiso mandar, y el campo es un `json` libre en la base. Copiar solo lo que se
 * reconoce impide que alguien guarde ahí un documento arbitrario que luego se
 * pinte o se reenvíe. Una pieza con forma de identificador del atlas
 * (`FJ1234`, o `FJ1234#a` para un fragmento) y tres números finitos por vector.
 *
 * `undefined` y `null` valen como «sin ancla»; cualquier otra cosa mal formada
 * se rechaza en vez de descartarse en silencio, porque descartarla dejaría un
 * comentario que dice «sobre esta pieza» sin decir cuál.
 */
export function anclaOpcional(valor: unknown): AnclaDeComentario | undefined {
  if (valor === undefined || valor === null) return undefined
  if (typeof valor !== 'object' || Array.isArray(valor)) rechazar('El ancla del comentario no es válida.')
  const { pieza, punto, vista } = valor as Record<string, unknown>
  if (typeof pieza !== 'string' || !/^[A-Za-z0-9_.:#-]{1,60}$/.test(pieza)) {
    rechazar('El ancla del comentario no nombra una pieza válida.')
  }
  const ancla: AnclaDeComentario = { pieza }
  if (punto !== undefined && punto !== null) {
    if (!esVector(punto)) rechazar('El punto del comentario no es válido.')
    ancla.punto = [punto[0], punto[1], punto[2]]
  }
  if (vista !== undefined && vista !== null) {
    const { camara, objetivo } = vista as Record<string, unknown>
    if (!esVector(camara) || !esVector(objetivo)) rechazar('La vista del comentario no es válida.')
    ancla.vista = {
      camara: [camara[0], camara[1], camara[2]],
      objetivo: [objetivo[0], objetivo[1], objetivo[2]],
    }
  }
  return ancla
}
