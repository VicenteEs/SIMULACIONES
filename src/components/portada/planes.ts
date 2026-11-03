import type { FilaDeLaComparativa } from '@/lib/espaciosDeLaPagina'

/**
 * La estructura de `/planes` (P-007 E3): qué planes hay, en qué orden y qué
 * incluye cada uno. Los textos no están aquí sino en `espaciosDeLaPagina.ts`,
 * y se cambian desde «Medios de la página».
 *
 * Qué plan lleva cada fila no es un texto sino una promesa comercial: un
 * administrador que pudiera poner un visto en «Varias sedes» del plan
 * Servicio desde el panel estaría cambiando el contrato sin que nadie lo
 * revisara. Por eso los vistos viven en el código, y lo único editable de la
 * fila es cómo se llama.
 */
export type ClaveDePlan = 'servicio' | 'programa' | 'institucion'

export const PLANES: readonly ClaveDePlan[] = ['servicio', 'programa', 'institucion']

/** El plan que va en oscuro y un poco más alto, con su sello. */
export const PLAN_DESTACADO: ClaveDePlan = 'programa'

export type GrupoDeLaComparativa = 'contenido' | 'seguimiento' | 'acompanamiento'

/** Las filas por grupo, en el orden en que se pintan. */
export const GRUPOS_DE_LA_COMPARATIVA: readonly {
  grupo: GrupoDeLaComparativa
  filas: readonly FilaDeLaComparativa[]
}[] = [
  {
    grupo: 'contenido',
    filas: ['contenido', 'simulador', 'casos-propios', 'kinesiologia'],
  },
  { grupo: 'seguimiento', filas: ['panel', 'informe', 'sedes'] },
  { grupo: 'acompanamiento', filas: ['soporte', 'puesta-en-marcha'] },
]

/**
 * Lo que incluye cada plan, fila por fila. Es la tabla de Penpot (D-232) tal
 * cual; «Soporte» y «Puesta en marcha» quedaron supuestos allí y están
 * anotados como borrador en D-235.
 */
export const INCLUYE: Record<FilaDeLaComparativa, Record<ClaveDePlan, boolean>> = {
  contenido: { servicio: true, programa: true, institucion: true },
  simulador: { servicio: true, programa: true, institucion: true },
  'casos-propios': { servicio: false, programa: true, institucion: true },
  kinesiologia: { servicio: false, programa: false, institucion: true },
  panel: { servicio: true, programa: true, institucion: true },
  informe: { servicio: false, programa: true, institucion: true },
  sedes: { servicio: false, programa: false, institucion: true },
  soporte: { servicio: true, programa: true, institucion: true },
  'puesta-en-marcha': { servicio: false, programa: false, institucion: true },
}
