import type { CollectionConfig } from 'payload'
import { accesoDePropiedad, administracionDeUsuarios } from '@/access/payload'

export const Comentarios: CollectionConfig = {
  slug: 'comentarios',
  labels: { singular: 'Comentario', plural: 'Comentarios' },
  admin: {
    useAsTitle: 'texto',
    defaultColumns: ['usuario', 'coleccion', 'estado', 'createdAt'],
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
        if (operation === 'create') {
          return { ...data, usuario: req.user?.id }
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === 'create' && process.env.SMTP_HOST) {
          try {
            const adminQuery = await req.payload.find({
              collection: 'usuarios',
              where: {
                and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }],
              },
              limit: 10,
            })

            const adminEmails = adminQuery.docs.map((a: any) => a.email).filter(Boolean)

            if (adminEmails.length > 0) {
              await req.payload.sendEmail({
                to: adminEmails,
                subject: `Nuevo comentario en ${doc.coleccion}`,
                html: `<p>Se ha publicado un nuevo comentario.</p>
                       <p><strong>Usuario:</strong> ${req.user?.email || 'Desconocido'}</p>
                       <p><strong>Comentario:</strong> ${doc.texto}</p>`,
              })
            }
          } catch (error) {
            req.payload.logger.error({ msg: 'Error al enviar email de comentario', err: error })
          }
        }
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'usuario',
      type: 'relationship',
      relationTo: 'usuarios',
      required: true,
      admin: {
        readOnly: true,
      },
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
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'documentoId',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'texto',
      type: 'textarea',
      required: true,
    },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'pendiente',
      options: [
        { label: 'Pendiente', value: 'pendiente' },
        { label: 'Resuelto', value: 'resuelto' },
      ],
      access: {
        update: ({ req: { user } }) => Boolean(user && (user.rol === 'admin' || user.rol === 'editor')),
      },
    },
  ],
}
