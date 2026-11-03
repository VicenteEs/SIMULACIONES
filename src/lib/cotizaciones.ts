import { MODULOS } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Lo que es una cotización, para el formulario de la portada, la acción que la
 * guarda, la colección y la pestaña del panel (P-007 E3).
 *
 * Sin Payload ni nada de servidor: el formulario lo importa para avisar
 * mientras se escribe con la misma regla que aplica la acción, y así el
 * visitante no descubre al enviar algo que se le podía haber dicho antes.
 */

/** Cuántos residentes, en tramos: un número exacto nadie lo sabe al pedir una propuesta. */
export const TRAMOS_DE_RESIDENTES = ['1 a 5', '6 a 10', '11 a 20', 'Más de 20'] as const
export type TramoDeResidentes = (typeof TRAMOS_DE_RESIDENTES)[number]

export const ESTADOS_DE_COTIZACION = [
  { valor: 'nueva', etiqueta: 'Nueva' },
  { valor: 'en-conversacion', etiqueta: 'En conversación' },
  { valor: 'cerrada', etiqueta: 'Cerrada' },
] as const
export type EstadoDeCotizacion = (typeof ESTADOS_DE_COTIZACION)[number]['valor']

export const esEstadoDeCotizacion = (valor: unknown): valor is EstadoDeCotizacion =>
  ESTADOS_DE_COTIZACION.some((e) => e.valor === valor)

export const etiquetaDeEstado = (valor: unknown): string =>
  ESTADOS_DE_COTIZACION.find((e) => e.valor === valor)?.etiqueta ?? String(valor ?? '')

/** `notas` las escribe el administrador; el resto, quien pide. */
export const LARGOS_DE_COTIZACION = { nombre: 120, correo: 254, institucion: 160, cargo: 80, mensaje: 1000, notas: 4000 } as const

/** Los módulos que se pueden marcar: los cinco de la tabla única, por su slug. */
export const MODULOS_COTIZABLES = MODULOS.map((m) => ({ slug: m.slug, numero: m.numero, nombre: m.nombre }))
const SLUGS = new Set<string>(MODULOS.map((m) => m.slug))

/** El nombre corto de cada módulo en las fichas del formulario, como en Penpot. */
export const NOMBRE_CORTO_DE_MODULO: Record<string, string> = {
  patologias: 'Biblioteca',
  maniobras: 'Examen físico',
  'casos-ao': 'Técnica AO',
  cirugias: 'Simulador',
  'estudios-ia': 'Imágenes',
}

export interface DatosDeCotizacion {
  nombre: string
  correo: string
  institucion: string
  cargo: string
  residentes: string
  modulos: string[]
  mensaje: string
}

export type ProblemasDeCotizacion = Partial<Record<keyof DatosDeCotizacion, string>>

const PARECE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Lo que está mal en lo escrito, campo a campo; vacío si se puede enviar.
 *
 * Es la regla de forma. La acción repite esto y además rechaza enlaces en el
 * nombre, la institución y el cargo (`exigirSinEnlaces`), que no se avisa
 * aquí: lo que un robot intenta colar no es algo que una persona escriba sin
 * querer.
 */
export function problemasDeLaCotizacion(datos: DatosDeCotizacion): ProblemasDeCotizacion {
  const problemas: ProblemasDeCotizacion = {}
  const largo = (texto: string) => [...texto.trim()].length

  if (!datos.nombre.trim()) problemas.nombre = 'Escribe tu nombre.'
  else if (largo(datos.nombre) > LARGOS_DE_COTIZACION.nombre) problemas.nombre = `El nombre no puede pasar de ${LARGOS_DE_COTIZACION.nombre} caracteres.`

  if (!datos.correo.trim()) problemas.correo = 'Escribe un correo para responderte.'
  else if (!PARECE_CORREO.test(datos.correo.trim()) || largo(datos.correo) > LARGOS_DE_COTIZACION.correo)
    problemas.correo = 'Ese correo no parece válido: revisa que tenga @ y dominio.'

  if (!datos.institucion.trim()) problemas.institucion = 'Escribe tu hospital, universidad o servicio.'
  else if (largo(datos.institucion) > LARGOS_DE_COTIZACION.institucion)
    problemas.institucion = `La institución no puede pasar de ${LARGOS_DE_COTIZACION.institucion} caracteres.`

  if (largo(datos.cargo) > LARGOS_DE_COTIZACION.cargo) problemas.cargo = `El cargo no puede pasar de ${LARGOS_DE_COTIZACION.cargo} caracteres.`

  if (!(TRAMOS_DE_RESIDENTES as readonly string[]).includes(datos.residentes)) problemas.residentes = 'Elige cuántos residentes son.'

  if (datos.modulos.some((m) => !SLUGS.has(m))) problemas.modulos = 'Hay un módulo que no existe.'

  if (largo(datos.mensaje) > LARGOS_DE_COTIZACION.mensaje)
    problemas.mensaje = `El mensaje no puede pasar de ${LARGOS_DE_COTIZACION.mensaje} caracteres.`

  return problemas
}
