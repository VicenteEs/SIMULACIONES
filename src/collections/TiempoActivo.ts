import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'

/**
 * Cuánto tiempo estuvo activa cada cuenta, una fila por cuenta y día (D-145).
 *
 * Lo suma el servidor con los latidos que manda el navegador mientras alguien
 * tiene la plataforma a la vista y la toca (`registrarLatido`,
 * `src/lib/registroServidor.ts`): cada latido abona lo que de verdad pasó desde
 * el anterior, con techo, y no lo que el navegador diga. Una fila por día y no
 * por latido porque un latido por minuto son cientos de filas al día por cuenta
 * que nadie lee una a una; lo que se mira es el total, y a qué horas fue.
 *
 * `porHora` es `{ "08": 1260, "09": 3010 }`: segundos activos por hora local,
 * para ver cuándo trabaja cada persona sin guardar cada latido.
 */
export const TiempoActivo: CollectionConfig = {
  slug: 'tiempo-activo',
  labels: { singular: 'Tiempo activo', plural: 'Tiempo activo' },
  admin: {
    useAsTitle: 'dia',
    defaultColumns: ['dia', 'usuario', 'segundos'],
    group: 'Administración',
  },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
  },
  // Una fila por cuenta y día, y que lo garantice la base: dos pestañas que
  // latan a la vez no pueden abrir dos filas y partir el total del día.
  indexes: [{ fields: ['usuario', 'dia'], unique: true }],
  fields: [
    {
      // A nulo al borrar la cuenta: el tiempo que trabajó no deja de haber
      // ocurrido, y las estadísticas de otros días no se mueven.
      name: 'usuario',
      type: 'relationship',
      relationTo: 'usuarios',
      index: true,
    },
    { name: 'dia', type: 'text', required: true, index: true, label: 'Día (AAAA-MM-DD)' },
    { name: 'segundos', type: 'number', min: 0, defaultValue: 0, label: 'Segundos activos' },
    { name: 'latidos', type: 'number', min: 0, defaultValue: 0, label: 'Latidos recibidos' },
    { name: 'porHora', type: 'json', label: 'Segundos por hora' },
    { name: 'ultimoLatido', type: 'date', label: 'Último latido' },
    { name: 'ultimaRuta', type: 'text', label: 'Última página' },
  ],
}
