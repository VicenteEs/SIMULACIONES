import type { CollectionConfig } from 'payload'
import { avisarAlPublicar } from './hooks/avisarAlPublicar'
import { lecturaDeModulo, escrituraDeModulo } from '@/access/payload'
import { editorClinico, pilaDeBloques } from '@/blocks'

/** Módulo 02 · Repositorio de examen físico. */
export const Maniobras: CollectionConfig = {
  slug: 'maniobras',
  labels: { singular: 'Maniobra', plural: 'Maniobras' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'segmento', 'evalua', '_status'],
    group: 'Módulos',
    description: 'Maniobras por segmento, con técnica, interpretación y video.',
  },
  access: {
    // Permisos por modulo: un editor puede tener asignados solo algunos.
    read: lecturaDeModulo('maniobras'),
    create: escrituraDeModulo('maniobras'),
    update: escrituraDeModulo('maniobras'),
    delete: escrituraDeModulo('maniobras'),
  },
  versions: { drafts: true, maxPerDoc: 50 },
  // Avisa a los navegadores conectados al publicar; el mismo gancho en los
  // cinco modulos.
  hooks: { afterChange: [avisarAlPublicar] },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre de la maniobra' },
    {
      name: 'segmento',
      type: 'relationship',
      relationTo: 'segmentos',
      required: true,
      label: 'Segmento',
    },
    { name: 'evalua', type: 'text', required: true, label: 'Qué evalúa' },
    {
      name: 'tecnica',
      type: 'richText',
      required: true,
      editor: editorClinico,
      label: 'Técnica',
    },
    {
      name: 'positivo',
      type: 'richText',
      required: true,
      editor: editorClinico,
      label: 'Qué se considera positivo',
    },
    {
      name: 'nota',
      type: 'richText',
      editor: editorClinico,
      label: 'Nota de interpretación',
    },
    pilaDeBloques('contenido', 'Material adicional'),
  ],
}
