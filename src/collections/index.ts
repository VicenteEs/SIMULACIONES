import type { CollectionConfig } from 'payload'
import { Usuarios } from './Usuarios'
import { Segmentos } from './Segmentos'
import { Medios } from './Medios'
import { Modelos3D } from './Modelos3D'
import { Patologias } from './Patologias'
import { Maniobras } from './Maniobras'
import { CasosAO } from './CasosAO'
import { Cirugias } from './Cirugias'
import { EstudiosIA } from './EstudiosIA'

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
export const COLECCIONES: CollectionConfig[] = [
  Usuarios,
  Segmentos,
  Medios,
  Modelos3D,
  Patologias,
  Maniobras,
  CasosAO,
  Cirugias,
  EstudiosIA,
]

export {
  Usuarios,
  Segmentos,
  Medios,
  Modelos3D,
  Patologias,
  Maniobras,
  CasosAO,
  Cirugias,
  EstudiosIA,
}
