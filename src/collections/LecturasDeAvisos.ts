import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'

/**
 * Quién leyó cada aviso de la plataforma: una fila por cuenta y difusión
 * (P-016 E6, D-375, D-406).
 *
 * Un aviso de la barra no se lee para todos a la vez: cada cuenta tiene que
 * dejar de verlo cuando lo cerró ella, y solo ella. La fila se escribe al
 * cerrarlo, desde el lugar de la cuenta, y por eso lleva la marca de su
 * institución y pasa por la segunda barrera como lo demás que deja cada
 * persona (D-399).
 *
 * Nadie la lee ni la escribe por la API: el servidor la toca con
 * `overrideAccess`. Al borrar la cuenta se borran con ella, como la actividad
 * (`bajaDeUsuario.ts`): sin la persona no dicen nada.
 */
export const LecturasDeAvisos: CollectionConfig = {
  slug: 'lecturas-de-avisos',
  labels: { singular: 'Lectura de un aviso', plural: 'Lecturas de avisos' },
  admin: {
    useAsTitle: 'leidaEn',
    defaultColumns: ['usuario', 'difusion', 'leidaEn'],
    group: 'Administración',
  },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
  },
  // Una por cuenta y aviso, y que lo diga la base: dos pestañas que cierran el
  // mismo aviso a la vez no pueden dejar dos filas.
  indexes: [{ fields: ['usuario', 'difusion'], unique: true }],
  fields: [
    { name: 'usuario', type: 'relationship', relationTo: 'usuarios', index: true, label: 'Cuenta' },
    { name: 'difusion', type: 'relationship', relationTo: 'difusiones', index: true, label: 'Aviso' },
    { name: 'leidaEn', type: 'date', label: 'Leído el' },
    {
      // Por dónde se cerró: `ventana` («Entendido» o la X) o `boton`, siguiendo
      // el botón del aviso. Con eso el historial dice cuántos lo siguieron, que
      // es lo que se quiere saber de un aviso que pide hacer algo. En texto y no
      // como lista cerrada: la matriz de roles (`roles.test.ts`) reconoce las
      // filas de cada colección por un campo de texto, y solo el servidor la
      // escribe, siempre con uno de esos dos.
      name: 'via',
      type: 'text',
      label: 'Cerrado por',
    },
  ],
}
