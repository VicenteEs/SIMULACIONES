import type { CollectionConfig } from 'payload'
import { lecturaDeContenido, escrituraDeContenido } from '@/access/payload'
import { pilaDeBloques } from '@/blocks'

/**
 * Módulo 01 · Biblioteca de patologías (decisión D-021).
 *
 * Las seis pestañas son fijas para que el residente sepa siempre dónde buscar.
 * Dentro de cada una, el traumatólogo apila los bloques que quiera y los
 * reordena a voluntad: la estructura orienta, no encorseta.
 */
export const Patologias: CollectionConfig = {
  slug: 'patologias',
  labels: { singular: 'Patología', plural: 'Patologías' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'segmento', 'codigo', '_status'],
    group: 'Módulos',
    description: 'Fichas por segmento. Cada una termina en manejo y rehabilitación.',
  },
  access: {
    read: lecturaDeContenido,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  versions: { drafts: true, maxPerDoc: 50 },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre de la patología' },
    { name: 'subtitulo', type: 'text', label: 'Subtítulo' },
    {
      name: 'segmento',
      type: 'relationship',
      relationTo: 'segmentos',
      required: true,
      label: 'Segmento anatómico',
    },
    { name: 'codigo', type: 'text', label: 'Código AO/OTA o abreviatura' },
    {
      name: 'tipo',
      type: 'select',
      defaultValue: 'trauma',
      label: 'Tipo',
      options: [
        { label: 'Trauma', value: 'trauma' },
        { label: 'Ortopedia', value: 'ortopedia' },
      ],
    },
    {
      type: 'tabs',
      tabs: [
        { label: 'Definición', fields: [pilaDeBloques('definicion', 'Contenido de la pestaña')] },
        { label: 'Mecanismo', fields: [pilaDeBloques('mecanismo', 'Contenido de la pestaña')] },
        { label: 'Clasificación', fields: [pilaDeBloques('clasificacion', 'Contenido de la pestaña')] },
        { label: 'Evaluación', fields: [pilaDeBloques('evaluacion', 'Contenido de la pestaña')] },
        { label: 'Manejo', fields: [pilaDeBloques('manejo', 'Contenido de la pestaña')] },
        {
          label: 'Rehabilitación',
          description: 'La pestaña que abre la plataforma al equipo de kinesiología.',
          fields: [
            pilaDeBloques('rehabilitacion', 'Contenido de la pestaña'),
            {
              name: 'fases',
              type: 'array',
              label: 'Fases de rehabilitación',
              labels: { singular: 'Fase', plural: 'Fases' },
              fields: [
                { name: 'cuando', type: 'text', required: true, label: 'Periodo' },
                { name: 'titulo', type: 'text', required: true, label: 'Objetivo de la fase' },
                { name: 'contenido', type: 'textarea', required: true, label: 'Qué se trabaja' },
                { name: 'criterio', type: 'textarea', label: 'Criterio para progresar' },
              ],
            },
          ],
        },
      ],
    },
  ],
}
