import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'

/**
 * Segmentos anatómicos. Ordenan la biblioteca y el mapa corporal del examen
 * físico; los define el traumatólogo, no el código.
 */
export const Segmentos: CollectionConfig = {
  slug: 'segmentos',
  labels: { singular: 'Segmento', plural: 'Segmentos' },
  admin: { useAsTitle: 'nombre', defaultColumns: ['nombre', 'orden'], group: 'Estructura' },
  access: {
    read: lecturaSimple,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  defaultSort: 'orden',
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre del segmento' },
    { name: 'orden', type: 'number', defaultValue: 0, label: 'Orden de aparición' },
    {
      name: 'zonaMapa',
      type: 'group',
      label: 'Zona en el mapa corporal',
      admin: {
        description: 'Recuadro sensible del mapa. Se ajusta visualmente y se guarda aquí.',
      },
      fields: [
        { name: 'x', type: 'number', label: 'X' },
        { name: 'y', type: 'number', label: 'Y' },
        { name: 'ancho', type: 'number', label: 'Ancho' },
        { name: 'alto', type: 'number', label: 'Alto' },
      ],
    },
  ],
}
