import type { CollectionConfig, FieldAccess } from 'payload'
import {
  administracionDeUsuarios,
  edicionDeRequisito,
  escrituraDeContenido,
  soloAdministracion,
} from '@/access/payload'
import { enviarSinEsperar, hayCorreo } from '@/correo/enviar'
import { mensajeDeRequisitoNuevo, mensajeDeRequisitoRespondido } from '@/correo/mensajes'
import {
  ESTADOS_DE_REQUISITO,
  MODULOS_CON_BUZON,
  estadoDeRequisitoEnPalabras,
} from '@/lib/requisitos'
import { direccionPublica } from './Usuarios'

/**
 * El buzón de requisitos del módulo anunciado (D-163, E7).
 *
 * Los editores dejan lo que querrían que hiciera el módulo 06 —planificación con
 * imágenes del paciente— y cómo les gustaría; otros editores lo votan y el
 * administrador lo acepta o lo descarta, con una respuesta. Cuando se decida
 * construir el módulo de verdad, esto es la base del P-002.
 *
 * Solo lo ven y lo escriben editores y administradores: el residente ve la
 * descripción del módulo y no el buzón. Lo que se propone no es contenido
 * publicado, y mucho de ello son ideas a medias de quien enseña.
 *
 * Los votos no se escriben por la API: los gestiona la acción `votarRequisito`,
 * que los alterna por cuenta. Un campo que cualquier editor pudiera reescribir
 * permitiría votar por otros o vaciar los de los demás.
 */

/** Lo que fija la plataforma al crear. Ver el porqué en `Comentarios.ts`: el acceso de campo solo actúa si el campo lo declara. */
const FIJADO_AL_CREAR: { update: FieldAccess } = { update: () => false }

/** Cuántos administradores como mucho reciben el aviso: un tope de cortesía, no una política. */
const MAXIMO_DE_ADMINISTRADORES_AVISADOS = 200

export const Requisitos: CollectionConfig = {
  slug: 'requisitos',
  labels: { singular: 'Requisito', plural: 'Requisitos' },
  admin: {
    useAsTitle: 'titulo',
    defaultColumns: ['titulo', 'estado', 'autor', 'createdAt'],
    group: 'Administración',
  },
  access: {
    read: escrituraDeContenido,
    create: escrituraDeContenido,
    update: edicionDeRequisito,
    delete: administracionDeUsuarios,
  },
  hooks: {
    beforeChange: [
      ({ req, data, operation }) => {
        if (operation === 'create') return { ...data, autor: req.user?.id ?? data?.autor }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        if (!hayCorreo()) return doc
        try {
          if (operation === 'create') {
            const admins = await req.payload.find({
              collection: 'usuarios',
              where: { and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }] },
              limit: MAXIMO_DE_ADMINISTRADORES_AVISADOS,
              depth: 0,
            })
            const correos = admins.docs.map((a: { email?: string }) => a.email).filter(Boolean) as string[]
            if (correos.length > 0) {
              // Sin esperar el diálogo SMTP: este gancho corre dentro de la
              // transacción de la escritura (ver `Comentarios.ts`).
              enviarSinEsperar(
                req.payload,
                {
                  para: correos,
                  correo: mensajeDeRequisitoNuevo({
                    autor: req.user?.nombre?.trim() || req.user?.email || 'Cuenta desconocida',
                    titulo: String(doc.titulo ?? ''),
                    descripcion: String(doc.descripcion ?? ''),
                    enlace: `${direccionPublica()}/planificacion#requisito-${doc.id}`,
                  }),
                },
                'aviso de requisito nuevo',
              )
            }
          } else if (previousDoc && previousDoc.estado !== doc.estado) {
            // Cambió de estado: se le avisa a quien lo propuso.
            const idDelAutor = typeof doc.autor === 'object' ? doc.autor?.id : doc.autor
            if (idDelAutor !== undefined && idDelAutor !== null) {
              const autor = (await req.payload.findByID({
                collection: 'usuarios',
                id: idDelAutor,
                depth: 0,
                overrideAccess: true,
                disableErrors: true,
              })) as { email?: string; nombre?: string } | null
              if (autor?.email) {
                enviarSinEsperar(
                  req.payload,
                  {
                    para: [autor.email],
                    correo: mensajeDeRequisitoRespondido({
                      nombre: autor.nombre,
                      titulo: String(doc.titulo ?? ''),
                      estado: estadoDeRequisitoEnPalabras(doc.estado),
                      respuesta: String(doc.respuesta ?? ''),
                      enlace: `${direccionPublica()}/planificacion#requisito-${doc.id}`,
                    }),
                  },
                  'aviso de requisito respondido',
                )
              }
            }
          }
        } catch (error) {
          req.payload.logger.error({ msg: 'Error al enviar el aviso de un requisito', err: error })
        }
        return doc
      },
    ],
  },
  fields: [
    { name: 'titulo', type: 'text', required: true, maxLength: 120, label: 'Título' },
    { name: 'descripcion', type: 'textarea', required: true, maxLength: 4000, label: 'Descripción' },
    {
      name: 'modulo',
      type: 'select',
      required: true,
      defaultValue: 'planificacion',
      options: MODULOS_CON_BUZON.map((m) => ({ label: m, value: m })),
      access: FIJADO_AL_CREAR,
      admin: { readOnly: true },
    },
    {
      // Sin `required` a propósito, como `comentarios.usuario`: al dar de baja
      // la cuenta, lo que propuso se conserva sin autor. El gancho siempre lo
      // pone al crear y el acceso de campo impide cambiarlo después.
      name: 'autor',
      type: 'relationship',
      relationTo: 'usuarios',
      access: FIJADO_AL_CREAR,
      admin: { readOnly: true },
    },
    {
      // Las dos operaciones, no solo `update`: Payload se salta el acceso de un
      // campo cuya operación no está declarada (ver `estado` de `comentarios`).
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'propuesto',
      options: ESTADOS_DE_REQUISITO.map((e) => ({ label: e.label, value: e.value })),
      access: { create: soloAdministracion, update: soloAdministracion },
    },
    {
      name: 'respuesta',
      type: 'textarea',
      maxLength: 2000,
      label: 'Respuesta del administrador',
      access: { create: soloAdministracion, update: soloAdministracion },
    },
    {
      // Quién lo votó. Lo gestiona `votarRequisito`; por la API no se escribe.
      name: 'votos',
      type: 'relationship',
      relationTo: 'usuarios',
      hasMany: true,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
    },
  ],
}
