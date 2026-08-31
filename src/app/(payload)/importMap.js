import { EditorEncuadre } from '@/components/admin/EditorEncuadre'

/**
 * Componentes propios del panel de administración.
 *
 * Payload los resuelve por esta tabla en lugar de importarlos dinámicamente,
 * de modo que toda ruta declarada en una colección debe aparecer aquí.
 */
export const importMap = {
  '@/components/admin/EditorEncuadre#EditorEncuadre': EditorEncuadre,
}
