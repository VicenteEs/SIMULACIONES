import type { CollectionConfig } from 'payload'
import { Usuarios } from './Usuarios'
import { Segmentos } from './Segmentos'
import { TiposDeFicha } from './TiposDeFicha'
import { EstructurasAnatomicas } from './EstructurasAnatomicas'
import { Medios } from './Medios'
import { Modelos3D } from './Modelos3D'
import { InstanciasAtlas } from './InstanciasAtlas'
import { Patologias } from './Patologias'
import { Maniobras } from './Maniobras'
import { CasosAO } from './CasosAO'
import { Cirugias } from './Cirugias'
import { EstudiosIA } from './EstudiosIA'
import { Comentarios } from './Comentarios'
import { Ajustes } from './Ajustes'
import { Requisitos } from './Requisitos'
import { Equipo } from './Equipo'
import { MediosPagina } from './MediosPagina'
import { TextosPagina } from './TextosPagina'
import { Cotizaciones } from './Cotizaciones'
import { Actividad } from './Actividad'
import { Difusiones } from './Difusiones'
import { Revisiones } from './Revisiones'
import { SesionesDeRevision } from './SesionesDeRevision'
import { RegistroDeAcciones } from './RegistroDeAcciones'
import { Entradas } from './Entradas'
import { TiempoActivo } from './TiempoActivo'
import { ResolucionesDeReferencia } from './ResolucionesDeReferencia'
import { conRegistro } from './hooks/registrarAccion'
import { conMarcaDeInstitucion } from './hooks/marcaDeInstitucion'
import { Instituciones } from './Instituciones'
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
  Instituciones,
  Usuarios,
  Segmentos,
  TiposDeFicha,
  Medios,
  Modelos3D,
  InstanciasAtlas,
  EstructurasAnatomicas,
  ...CATALOGOS_DEL_SIMULADOR,
  Patologias,
  Maniobras,
  CasosAO,
  Cirugias,
  ResolucionesDeReferencia,
  EstudiosIA,
  Comentarios,
  Actividad,
  Difusiones,
  Revisiones,
  SesionesDeRevision,
  RegistroDeAcciones,
  Entradas,
  TiempoActivo,
  Ajustes,
  Requisitos,
  Equipo,
  MediosPagina,
  TextosPagina,
  Cotizaciones,
]

/**
 * Las mismas colecciones con la marca de institución (D-396) y los ganchos del
 * registro de acciones (D-145) puestos: ninguna fila queda sin su institución,
 * ni ninguna escritura sin anotar, por olvido de quien declara la colección. La
 * marca va antes, para que el registro de la escritura ya la vea.
 */
export const COLECCIONES: CollectionConfig[] = DECLARADAS.map(conMarcaDeInstitucion).map(conRegistro)

export {
  Instituciones,
  Usuarios,
  Segmentos,
  TiposDeFicha,
  Medios,
  Modelos3D,
  InstanciasAtlas,
  EstructurasAnatomicas,
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
  Ajustes,
  Equipo,
}
