import type { CollectionConfig } from 'payload'
import { accesoDePropiedad, administracionDeUsuarios } from '@/access/payload'

/**
 * Seguimiento de lectura: qué ficha visitó cada usuario y cuál dio por leída.
 *
 * No es analítica de producto sino la base del progreso que ve el residente y
 * del panel de actividad del administrador. Un registro por usuario y ficha; se
 * actualiza en lugar de acumular filas, porque interesa el estado, no el
 * historial completo de visitas.
 */
export const Actividad: CollectionConfig = {
  slug: 'actividad',
  labels: { singular: 'Actividad', plural: 'Actividad' },
  admin: {
    useAsTitle: 'documentoId',
    defaultColumns: ['usuario', 'coleccion', 'completado', 'ultimaVisita'],
    group: 'Administración',
    description: 'Qué ha visitado y marcado como leído cada residente.',
  },
  access: {
    read: accesoDePropiedad,
    create: ({ req: { user } }) => Boolean(user && user.activo),
    update: accesoDePropiedad,
    delete: administracionDeUsuarios,
  },
  hooks: {
    beforeChange: [
      ({ req, data, operation }) => {
        const ahora = new Date().toISOString()
        if (operation === 'create') {
          return { ...data, usuario: req.user?.id, ultimaVisita: ahora }
        }
        if (operation === 'update') {
          return { ...data, ultimaVisita: ahora }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'usuario',
      type: 'relationship',
      relationTo: 'usuarios',
      required: true,
      admin: { readOnly: true },
    },
    {
      name: 'coleccion',
      type: 'select',
      required: true,
      options: [
        { label: 'patologias', value: 'patologias' },
        { label: 'maniobras', value: 'maniobras' },
        { label: 'casos-ao', value: 'casos-ao' },
        { label: 'cirugias', value: 'cirugias' },
        { label: 'estudios-ia', value: 'estudios-ia' },
      ],
      admin: { readOnly: true },
    },
    {
      name: 'documentoId',
      type: 'text',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'ultimaVisita',
      type: 'date',
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'completado',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
}
