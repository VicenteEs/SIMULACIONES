/**
 * Lógica de presentación de una ficha de patología.
 *
 * Las seis pestañas son fijas para que el residente sepa siempre dónde buscar,
 * pero solo se muestran las que el autor llenó: una ficha en construcción no
 * debe exhibir cuatro pestañas vacías, porque parecería rota en vez de
 * incompleta.
 */

export interface Pestana {
  campo: string
  etiqueta: string
}

export const PESTANAS_FICHA: readonly Pestana[] = [
  { campo: 'definicion', etiqueta: 'Definición' },
  { campo: 'mecanismo', etiqueta: 'Mecanismo' },
  { campo: 'clasificacion', etiqueta: 'Clasificación' },
  { campo: 'evaluacion', etiqueta: 'Evaluación' },
  { campo: 'manejo', etiqueta: 'Manejo' },
  { campo: 'rehabilitacion', etiqueta: 'Rehabilitación' },
]

/** Un campo de bloques tiene contenido si trae al menos un bloque. */
export function hayContenido(valor: unknown): boolean {
  return Array.isArray(valor) && valor.length > 0
}

export type FichaParcial = Record<string, unknown>

/**
 * Las pestañas que corresponde mostrar, siempre en el orden fijo.
 *
 * Rehabilitación es un caso aparte: puede tener solo fases, sin bloques, y aun
 * así merece mostrarse porque las fases son su contenido principal.
 */
export function pestanasConContenido(ficha: FichaParcial): Pestana[] {
  return PESTANAS_FICHA.filter((p) => {
    if (hayContenido(ficha[p.campo])) return true
    if (p.campo === 'rehabilitacion' && hayContenido(ficha.fases)) return true
    return false
  })
}
