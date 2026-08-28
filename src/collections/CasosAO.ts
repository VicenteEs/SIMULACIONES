import type { CollectionConfig } from 'payload'
import { lecturaDeContenido, escrituraDeContenido } from '@/access/payload'
import { pilaDeBloques } from '@/blocks'

/** Módulo 03 · Técnica AO paso a paso. */
export const CasosAO: CollectionConfig = {
  slug: 'casos-ao',
  labels: { singular: 'Caso AO', plural: 'Casos AO' },
  admin: {
    useAsTitle: 'titulo',
    defaultColumns: ['titulo', 'codigo', '_status'],
    group: 'Módulos',
    description: 'La secuencia quirúrgica con el principio AO que sustenta cada gesto.',
  },
  access: {
    read: lecturaDeContenido,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  versions: { drafts: true, maxPerDoc: 50 },
  fields: [
    { name: 'titulo', type: 'text', required: true, label: 'Título del caso' },
    { name: 'codigo', type: 'text', label: 'Código AO/OTA' },
    { name: 'procedimiento', type: 'textarea', label: 'Procedimiento' },
    {
      name: 'pasos',
      type: 'array',
      label: 'Pasos de la cirugía',
      labels: { singular: 'Paso', plural: 'Pasos' },
      fields: [
        { name: 'titulo', type: 'text', required: true, label: 'Título del paso' },
        { name: 'descripcion', type: 'textarea', required: true, label: 'Qué se hace' },
        { name: 'principio', type: 'text', required: true, label: 'Principio AO en juego' },
        { name: 'nota', type: 'textarea', label: 'Nota técnica' },
        {
          name: 'modelo',
          type: 'relationship',
          relationTo: 'modelos-3d',
          label: 'Modelo 3D del paso',
        },
      ],
    },
    pilaDeBloques('contenido', 'Material adicional'),
  ],
}
