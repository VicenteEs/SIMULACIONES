import {
  Activity,
  BookOpen,
  Bone,
  Layers,
  ScanLine,
  ShieldCheck,
  Stethoscope,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { MODULOS } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Los cinco capítulos de la portada pública, en el orden en que se leen
 * (P-007 E3, el «Inicio · visitante v2» de Penpot, D-231).
 *
 * Aquí va solo la estructura: qué módulo cuenta cada uno, de qué lado va la
 * ilustración, con qué color y con qué íconos. Los textos no: los escribe el
 * administrador desde «Medios de la página» y viven en
 * `src/lib/espaciosDeLaPagina.ts`, bajo `portada.<clave>.*`. Un texto escrito
 * aquí sería una segunda copia que el panel no podría cambiar.
 *
 * El número, el nombre y la ruta salen de la tabla única de módulos
 * (`admin-panel/modulos.ts`): un capítulo que dijera «04» sobre el módulo que
 * la barra llama «03» es la clase de desajuste que esa tabla existe para
 * impedir.
 */

export type ClaveDeCapitulo = 'estudia' | 'examina' | 'tecnica' | 'opera' | 'interpreta'
export type CapaDelCuerpo = 'piel' | 'musculo' | 'hueso'

export interface CapituloDeLaPortada {
  clave: ClaveDeCapitulo
  /** El slug del módulo: manda en la mantención y en el color (`--mod-n`). */
  modulo: (typeof MODULOS)[number]['slug']
  numero: string
  ruta: string
  nombreDelModulo: string
  /** Del 1 al 5, el `--mod-n` de `estilos.css`. */
  tono: 1 | 2 | 3 | 4 | 5
  /** Opera va sobre marino, como en Penpot; los demás sobre papel. */
  fondo: 'claro' | 'oscuro'
  /** De qué lado va la ilustración; los capítulos alternan para que la lectura zigzaguee. */
  ilustracion: 'izquierda' | 'derecha'
  /**
   * Un ícono por punto, o `null` para numerarlos: Opera los numera porque los
   * mismos números marcan la captura de la consola.
   */
  iconos: readonly [LucideIcon, LucideIcon, LucideIcon] | null
  /** En Opera, los puntos van bajo la captura y el botón es el principal. */
  destacado: boolean
}

const modulo = (slug: CapituloDeLaPortada['modulo']) => {
  const m = MODULOS.find((x) => x.slug === slug)
  if (!m) throw new Error(`El módulo ${slug} no está en admin-panel/modulos.ts`)
  return { modulo: m.slug, numero: m.numero, ruta: m.ruta, nombreDelModulo: m.nombre }
}

export const CAPITULOS: readonly CapituloDeLaPortada[] = [
  {
    clave: 'estudia',
    ...modulo('patologias'),
    tono: 1,
    fondo: 'claro',
    ilustracion: 'izquierda',
    iconos: [Layers, ScanLine, BookOpen],
    destacado: false,
  },
  {
    clave: 'examina',
    ...modulo('maniobras'),
    tono: 2,
    fondo: 'claro',
    ilustracion: 'derecha',
    iconos: [Stethoscope, Activity, Users],
    destacado: false,
  },
  {
    clave: 'tecnica',
    ...modulo('casos-ao'),
    tono: 3,
    fondo: 'claro',
    ilustracion: 'izquierda',
    iconos: [Workflow, ShieldCheck, Bone],
    destacado: false,
  },
  {
    clave: 'opera',
    ...modulo('cirugias'),
    tono: 4,
    fondo: 'oscuro',
    ilustracion: 'derecha',
    iconos: null,
    destacado: true,
  },
  {
    clave: 'interpreta',
    ...modulo('estudios-ia'),
    tono: 5,
    fondo: 'claro',
    ilustracion: 'izquierda',
    iconos: [ScanLine, Workflow, ShieldCheck],
    destacado: false,
  },
]
