import type { CollectionConfig } from 'payload'
import { lecturaDeContenido, escrituraDeContenido } from '@/access/payload'
import { pilaDeBloques } from '@/blocks'

/**
 * Módulo 04 · Simulador quirúrgico.
 *
 * Cada paso declara el instrumento correcto y un rango de fuerza útil: por
 * debajo la maniobra falla, por encima se produce una complicación. Ese diseño
 * es lo que convierte una animación en un ejercicio evaluable.
 */
export const Cirugias: CollectionConfig = {
  slug: 'cirugias',
  labels: { singular: 'Cirugía simulada', plural: 'Cirugías simuladas' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'codigo', '_status'],
    group: 'Módulos',
    description: 'Guion quirúrgico paso a paso con instrumental y fuerza aplicada.',
  },
  access: {
    read: lecturaDeContenido,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  versions: { drafts: true, maxPerDoc: 50 },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre de la cirugía' },
    { name: 'codigo', type: 'text', label: 'Código AO/OTA' },
    { name: 'resumen', type: 'textarea', label: 'Resumen del procedimiento' },
    {
      name: 'pasos',
      type: 'array',
      label: 'Pasos del guion quirúrgico',
      labels: { singular: 'Paso', plural: 'Pasos' },
      fields: [
        { name: 'titulo', type: 'text', required: true, label: 'Título del paso' },
        { name: 'descripcion', type: 'textarea', required: true, label: 'Qué se hace' },
        { name: 'instrumento', type: 'text', required: true, label: 'Instrumento correcto' },
        {
          type: 'row',
          fields: [
            { name: 'fuerzaMinima', type: 'number', required: true, label: 'Fuerza mínima útil (N)' },
            { name: 'fuerzaMaxima', type: 'number', required: true, label: 'Fuerza máxima útil (N)' },
          ],
        },
        { name: 'exito', type: 'textarea', required: true, label: 'Resultado correcto' },
        { name: 'insuficiente', type: 'textarea', required: true, label: 'Si la fuerza es insuficiente' },
        { name: 'excesivo', type: 'textarea', required: true, label: 'Si la fuerza es excesiva' },
        { name: 'riesgo', type: 'textarea', label: 'Estructura o principio en juego' },
      ],
    },
    pilaDeBloques('contenido', 'Material adicional'),
  ],
}
