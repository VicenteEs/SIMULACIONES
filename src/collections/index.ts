import type { CollectionConfig } from 'payload'
import { Usuarios } from './Usuarios'
import { Segmentos } from './Segmentos'
import { Medios } from './Medios'
import { Modelos3D } from './Modelos3D'
import { InstanciasAtlas } from './InstanciasAtlas'
import { Patologias } from './Patologias'
import { Maniobras } from './Maniobras'
import { CasosAO } from './CasosAO'
import { Cirugias } from './Cirugias'
import { EstudiosIA } from './EstudiosIA'
import { Comentarios } from './Comentarios'
import { Actividad } from './Actividad'
import { Difusiones } from './Difusiones'
import { Revisiones } from './Revisiones'
import { SesionesDeRevision } from './SesionesDeRevision'
import { RegistroDeAcciones } from './RegistroDeAcciones'
import { TiempoActivo } from './TiempoActivo'
import { conRegistro } from './hooks/registrarAccion'
import {
  CATALOGOS_DEL_SIMULADOR,
  ClasificacionesAO,
  FasesQuirurgicas,
  HuesosAO,
  Instrumental,
  TecnicasQuirurgicas,
} from './catalogos'

/** Los cinco módulos de la plataforma, en el orden en que se presentan. */
export const SLUGS_DE_MODULOS = [
  'patologias',
  'maniobras',
  'casos-ao',
  'cirugias',
  'estudios-ia',
] as const

/**
 * Inventario completo. Toda colección que se agregue aquí queda sujeta al
 * invariante de `tests/unit/colecciones.test.ts`: debe declarar sus cuatro
 * operaciones de acceso y ninguna puede permitir lectura ni escritura anónima.
 */
const DECLARADAS: CollectionConfig[] = [
  Usuarios,
  Segmentos,
  Medios,
  Modelos3D,
  InstanciasAtlas,
  ...CATALOGOS_DEL_SIMULADOR,
  Patologias,
  Maniobras,
  CasosAO,
  Cirugias,
  EstudiosIA,
  Comentarios,
  Actividad,
  Difusiones,
  Revisiones,
  SesionesDeRevision,
  RegistroDeAcciones,
  TiempoActivo,
]

/**
 * Las mismas colecciones con los ganchos del registro de acciones puestos
 * (D-145): ninguna escritura queda sin anotar por olvido de quien declara la
 * colección.
 */
export const COLECCIONES: CollectionConfig[] = DECLARADAS.map(conRegistro)

export {
  Usuarios,
  Segmentos,
  Medios,
  Modelos3D,
  InstanciasAtlas,
  HuesosAO,
  ClasificacionesAO,
  TecnicasQuirurgicas,
  FasesQuirurgicas,
  Instrumental,
  Patologias,
  Maniobras,
  CasosAO,
  Cirugias,
  EstudiosIA,
  Comentarios,
  Actividad,
  Difusiones,
  Revisiones,
  SesionesDeRevision,
  RegistroDeAcciones,
  TiempoActivo,
}
