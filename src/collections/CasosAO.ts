import type { CollectionConfig } from 'payload'
import { avisarAlPublicar } from './hooks/avisarAlPublicar'
import { lecturaDeModulo, escrituraDeModulo } from '@/access/payload'
import { editorClinico, pilaDeBloques } from '@/blocks'

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
    // Permisos por modulo: un editor puede tener asignados solo algunos.
    read: lecturaDeModulo('casos-ao'),
    create: escrituraDeModulo('casos-ao'),
    update: escrituraDeModulo('casos-ao'),
    delete: escrituraDeModulo('casos-ao'),
  },
  versions: { drafts: true, maxPerDoc: 50 },
  // Avisa a los navegadores conectados al publicar; el mismo gancho en los
  // cinco modulos.
  hooks: { afterChange: [avisarAlPublicar] },
  fields: [
    { name: 'titulo', type: 'text', required: true, label: 'Título del caso' },
    { name: 'codigo', type: 'text', label: 'Código AO/OTA' },
    {
      name: 'procedimiento',
      type: 'richText',
      editor: editorClinico,
      label: 'Procedimiento',
    },
    {
      name: 'pasos',
      type: 'array',
      label: 'Pasos de la cirugía',
      labels: { singular: 'Paso', plural: 'Pasos' },
      fields: [
        { name: 'titulo', type: 'text', required: true, label: 'Título del paso' },
        {
          name: 'descripcion',
          type: 'richText',
          required: true,
          editor: editorClinico,
          label: 'Qué se hace',
        },
        { name: 'principio', type: 'text', required: true, label: 'Principio AO en juego' },
        { name: 'nota', type: 'richText', editor: editorClinico, label: 'Nota técnica' },
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
