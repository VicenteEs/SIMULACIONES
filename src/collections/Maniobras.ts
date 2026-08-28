import type { CollectionConfig } from 'payload'
import { lecturaDeContenido, escrituraDeContenido } from '@/access/payload'
import { pilaDeBloques } from '@/blocks'

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
    read: lecturaDeContenido,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  versions: { drafts: true, maxPerDoc: 50 },
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
    { name: 'tecnica', type: 'textarea', required: true, label: 'Técnica' },
    { name: 'positivo', type: 'textarea', required: true, label: 'Qué se considera positivo' },
    { name: 'nota', type: 'textarea', label: 'Nota de interpretación' },
    pilaDeBloques('contenido', 'Material adicional'),
  ],
}
