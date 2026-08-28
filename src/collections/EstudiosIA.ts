import type { CollectionConfig } from 'payload'
import { lecturaDeContenido, escrituraDeContenido } from '@/access/payload'
import { pilaDeBloques } from '@/blocks'

/**
 * Módulo 05 · Reconocimiento de fractura.
 *
 * Fase tardía del proyecto. Hasta que exista un modelo entrenado, esta
 * colección guarda casos de demostración con resultados escritos a mano, y así
 * queda claro que no hay inferencia real detrás.
 */
export const EstudiosIA: CollectionConfig = {
  slug: 'estudios-ia',
  labels: { singular: 'Estudio de demostración', plural: 'Estudios de demostración' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'codigo', '_status'],
    group: 'Módulos',
    description: 'Casos precargados. No hay modelo de inferencia: los resultados están escritos.',
  },
  access: {
    read: lecturaDeContenido,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  versions: { drafts: true, maxPerDoc: 50 },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre del caso' },
    { name: 'codigo', type: 'text', label: 'Clasificación propuesta' },
    { name: 'confianza', type: 'number', min: 0, max: 100, label: 'Confianza declarada (%)' },
    {
      name: 'hallazgos',
      type: 'array',
      label: 'Hallazgos',
      fields: [{ name: 'texto', type: 'textarea', required: true, label: 'Hallazgo' }],
    },
    {
      name: 'opciones',
      type: 'array',
      label: 'Opciones de manejo',
      fields: [
        { name: 'titulo', type: 'text', required: true, label: 'Opción' },
        { name: 'frecuente', type: 'checkbox', label: 'Coincide con la indicación más frecuente' },
        {
          name: 'aFavor',
          type: 'array',
          label: 'A favor',
          fields: [{ name: 'texto', type: 'textarea', required: true, label: 'Argumento' }],
        },
        {
          name: 'enContra',
          type: 'array',
          label: 'En contra',
          fields: [{ name: 'texto', type: 'textarea', required: true, label: 'Argumento' }],
        },
      ],
    },
    pilaDeBloques('contenido', 'Material adicional'),
  ],
}
