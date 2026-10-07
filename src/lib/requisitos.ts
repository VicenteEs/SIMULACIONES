/**
 * El buzón de requisitos del módulo anunciado (D-163, E7): estados y
 * límites. Puro y sin imports: lo usan la colección, las acciones y la pantalla
 * del navegador (la validación, que arrastra la base, está en `validacion.ts`).
 */

export const ESTADOS_DE_REQUISITO = [
  { value: 'propuesto', label: 'Propuesto' },
  { value: 'en-estudio', label: 'En estudio' },
  { value: 'aceptado', label: 'Aceptado' },
  { value: 'hecho', label: 'Hecho' },
  { value: 'descartado', label: 'Descartado' },
] as const

export type EstadoDeRequisito = (typeof ESTADOS_DE_REQUISITO)[number]['value']

export const estadoDeRequisitoEnPalabras = (estado: unknown): string =>
  ESTADOS_DE_REQUISITO.find((e) => e.value === estado)?.label ?? String(estado ?? '—')

export const esEstadoDeRequisito = (valor: unknown): valor is EstadoDeRequisito =>
  ESTADOS_DE_REQUISITO.some((e) => e.value === valor)

export const LARGO_MAXIMO_DEL_TITULO = 120
export const LARGO_MAXIMO_DE_LA_DESCRIPCION = 4000
export const LARGO_MAXIMO_DE_LA_RESPUESTA = 2000

/** Los módulos que admiten un buzón. De momento, solo el anunciado. */
export const MODULOS_CON_BUZON = ['planificacion'] as const
export type ModuloConBuzon = (typeof MODULOS_CON_BUZON)[number]

