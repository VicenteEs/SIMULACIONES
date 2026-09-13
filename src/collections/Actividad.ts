import type { CollectionConfig, FieldAccess } from 'payload'
import { accesoDePropiedad, administracionDeUsuarios } from '@/access/payload'

/**
 * Los tres campos que identifican la fila: quién, qué módulo y qué ficha.
 *
 * Los fija el gancho o la acción al crear el registro, y a partir de ahí no se
 * tocan. `admin: { readOnly: true }` no lo impedía: es una indicación para la
 * interfaz de Payload —retirada en D-038— y el servidor nunca la miró. Lo único
 * que filtra campos en escritura es el acceso de campo, y solo sobre los que lo
 * declaran (`fields/hooks/beforeValidate/promise.js`:
 * `if (field.access && field.access[operation])`).
 *
 * El acceso de colección tampoco tapaba el hueco: `accesoDePropiedad` devuelve
 * `{ usuario: { equals: <id> } }`, y ese filtro decide **qué fila** se puede
 * tocar, no qué se escribe dentro. Así que un residente hacía
 * `PATCH /api/actividad/<fila-propia>` con `{"usuario": <otra cuenta>}` y movía
 * su historial de lectura a la cuenta de un compañero: las estadísticas del
 * panel —que el administrador usa para saber quién va al día— daban por leídas
 * fichas que ese compañero nunca abrió, y al residente por no haber leído nada.
 *
 * Solo se cierra la modificación: en la creación el gancho de abajo pone el
 * usuario. Y solo actúa por REST, porque el acceso de campo se salta con
 * `overrideAccess`, que es el valor por omisión de la API local con la que
 * escriben el panel y las acciones de servidor.
 */
const FIJADO_AL_CREAR: { update: FieldAccess } = { update: () => false }

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
      access: FIJADO_AL_CREAR,
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
      access: FIJADO_AL_CREAR,
      admin: { readOnly: true },
    },
    {
      name: 'documentoId',
      type: 'text',
      required: true,
      index: true,
      access: FIJADO_AL_CREAR,
      admin: { readOnly: true },
    },
    {
      // Este no lleva acceso de campo y no hace falta: el gancho de arriba lo
      // reescribe con la hora actual en cada creación y en cada modificación,
      // así que lo que mande el cliente se pierde de todos modos. Si algún día
      // el gancho deja de fijarlo, este campo necesita el mismo cierre que los
      // tres de arriba.
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
