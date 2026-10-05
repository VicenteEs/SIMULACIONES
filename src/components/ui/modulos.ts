import { BookOpen, Stethoscope, Workflow, Scissors, ScanLine, type LucideIcon } from 'lucide-react'

/**
 * Identidad visual de cada módulo: su icono y su color (`--mod-N` de
 * `estilos.css`). Un solo sitio para que la tarjeta de la portada, la barra,
 * la miga y la insignia de «Continúa leyendo» digan lo mismo.
 */
export type IdentidadDeModulo = { numero: 1 | 2 | 3 | 4 | 5; icono: LucideIcon; clase: string }

export const IDENTIDAD_DE_MODULO: Record<string, IdentidadDeModulo> = {
  patologias: { numero: 1, icono: BookOpen, clase: 'mod-1' },
  maniobras: { numero: 2, icono: Stethoscope, clase: 'mod-2' },
  'casos-ao': { numero: 3, icono: Workflow, clase: 'mod-3' },
  cirugias: { numero: 4, icono: Scissors, clase: 'mod-4' },
  'estudios-ia': { numero: 5, icono: ScanLine, clase: 'mod-5' },
}
