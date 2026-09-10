import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios, accesoAlPanel } from '@/access/payload'
import { ajustarPrimerUsuario } from './hooks/primerUsuario'
import { impedirAutobloqueo } from './hooks/autobloqueo'
import { limpiarRastroDeUsuario } from './hooks/bajaDeUsuario'

/**
 * Cuántos intentos fallidos bloquean una cuenta, y por cuánto tiempo.
 *
 * Están aquí y exportados porque la pantalla de entrada tiene que poder
 * explicárselo a quien se queda fuera. Cuando el mensaje repetía los números a
 * mano, cambiar el bloqueo dejaba a la pantalla mintiendo.
 */
export const INTENTOS_ANTES_DE_BLOQUEAR = 5
export const MINUTOS_DE_BLOQUEO = 10

/** Los cinco módulos, tal como se ofrecen al asignar permisos. */
const OPCIONES_DE_MODULO = [
  { label: 'Biblioteca de patologías', value: 'patologias' },
  { label: 'Examen físico', value: 'maniobras' },
  { label: 'Técnica AO', value: 'casos-ao' },
  { label: 'Simulador quirúrgico', value: 'cirugias' },
  { label: 'Lectura de imágenes', value: 'estudios-ia' },
]

/**
 * Correo para elegir contraseña nueva.
 *
 * El de Payload apunta a `/admin/reset/<testigo>`, y esa ruta es el redirector
 * de enlaces viejos que quedó al retirar su interfaz (D-038). Funcionaba, y
 * conviene decirlo con precisión porque aquí llegó a estar escrito lo
 * contrario: `formatAdminURL` sí antepone el prefijo, así que el enlace caía
 * dentro de la aplicación y el redirector lo llevaba a `/clave/`. Lo que no
 * quiere nadie es que el correo de recuperación dependa de un 308 sobre una
 * ruta retirada, sobre todo el día que esa ruta se limpie.
 *
 * Así que se arma aquí, en español y apuntando directo a la pantalla propia.
 * La dirección sale de `NEXT_PUBLIC_SERVER_URL`, que lleva el prefijo, y es la
 * misma que entrega el panel cuando un administrador genera el enlace a mano.
 *
 * Ver O-022 en BITACORA.md.
 */
export function correoDeClaveNueva(testigo: string): string {
  const base = (process.env.NEXT_PUBLIC_SERVER_URL || '').replace(/\/+$/, '')
  const enlace = `${base}/clave/${testigo}`
  return `
    <p>Alguien pidió una contraseña nueva para su cuenta de TraumaHub.</p>
    <p><a href="${enlace}">Elegir una contraseña nueva</a></p>
    <p>O copie esta dirección en el navegador:<br>${enlace}</p>
    <p>Si no fue usted, no hace falta hacer nada: la contraseña actual sigue
    siendo válida.</p>
  `
}

/**
 * Cuentas de la plataforma (decisión D-020).
 *
 * No hay registro abierto: el administrador crea cada cuenta y la activa. Una
 * cuenta desactivada conserva su contraseña pero no ve absolutamente nada, lo
 * que permite dar de baja a alguien sin borrar su historial.
 */
export const Usuarios: CollectionConfig = {
  slug: 'usuarios',
  labels: { singular: 'Usuario', plural: 'Usuarios' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'nombre', 'rol', 'activo', 'ultimoAcceso'],
    group: 'Administración',
  },
  auth: {
    // Cinco intentos y diez minutos de bloqueo: frena la fuerza bruta sin
    // castigar a quien simplemente se equivocó de tecla. Los dos números salen
    // de las constantes de arriba para que la pantalla de entrada pueda decir
    // la verdad sin repetirlos.
    maxLoginAttempts: INTENTOS_ANTES_DE_BLOQUEAR,
    lockTime: MINUTOS_DE_BLOQUEO * 60 * 1000,
    tokenExpiration: 8 * 60 * 60,
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
    forgotPassword: {
      generateEmailSubject: () => 'TraumaHub · elegir una contraseña nueva',
      generateEmailHTML: ({ token } = {}) => correoDeClaveNueva(String(token ?? '')),
    },
  },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
    admin: accesoAlPanel,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) =>
        ajustarPrimerUsuario({
          data,
          operacion: operation,
          contarUsuarios: async () => {
            const { totalDocs } = await req.payload.count({ collection: 'usuarios' })
            return totalDocs
          },
        }),
      async ({ data, req, operation, originalDoc }) =>
        impedirAutobloqueo({
          data,
          operacion: operation,
          documentoOriginal: originalDoc as Record<string, unknown> | undefined,
          idDeQuienEdita: req.user?.id === undefined ? undefined : String(req.user.id),
          contarOtrosAdmins: async (exceptoId) => {
            const { totalDocs } = await req.payload.count({
              collection: 'usuarios',
              where: {
                and: [
                  { rol: { equals: 'admin' } },
                  { activo: { equals: true } },
                  { id: { not_equals: exceptoId } },
                ],
              },
            })
            return totalDocs
          },
        }),
    ],
    // Antes de borrar la cuenta hay que decidir qué pasa con lo que deja: sin
    // esto, la base rechaza el borrado de cualquiera que haya leído una ficha.
    beforeDelete: [
      async ({ req, id }) => {
        await limpiarRastroDeUsuario({
          usuarioId: String(id),
          borrarActividad: async (usuarioId) => {
            const { docs } = await req.payload.delete({
              collection: 'actividad',
              where: { usuario: { equals: usuarioId } },
              req,
              overrideAccess: true,
            })
            return docs?.length ?? 0
          },
          anonimizarComentarios: async (usuarioId) => {
            const { docs } = await req.payload.update({
              collection: 'comentarios',
              where: { usuario: { equals: usuarioId } },
              data: { usuario: null },
              req,
              overrideAccess: true,
            })
            return docs?.length ?? 0
          },
        })
      },
    ],
    // Deja constancia de la última entrada. Es lo primero que se mira para
    // saber si una cuenta sigue en uso antes de darla de baja.
    //
    // El `req` se pasa a propósito: sin él, Payload abre una transacción nueva
    // que intenta escribir la misma fila que el propio login tiene tomada, y el
    // inicio de sesión se queda esperando el bloqueo durante minutos. Con él,
    // la escritura entra en la transacción que ya está abierta.
    afterLogin: [
      async ({ req, user }) => {
        try {
          await req.payload.update({
            collection: 'usuarios',
            id: user.id,
            data: { ultimoAcceso: new Date().toISOString() },
            req,
            overrideAccess: true,
          })
        } catch (error) {
          req.payload.logger.error({ msg: 'No se pudo anotar el último acceso', err: error })
        }
        return user
      },
    ],
  },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre y apellido' },
    {
      name: 'rol',
      type: 'select',
      required: true,
      defaultValue: 'lector',
      label: 'Rol',
      index: true,
      options: [
        { label: 'Administrador', value: 'admin' },
        { label: 'Editor de contenido', value: 'editor' },
        { label: 'Lector', value: 'lector' },
      ],
      admin: {
        description: 'El editor redacta y publica contenido; no crea ni activa cuentas.',
      },
    },
    {
      name: 'activo',
      type: 'checkbox',
      defaultValue: false,
      label: 'Cuenta activa',
      index: true,
      admin: {
        description: 'Mientras esté desmarcada, la cuenta no puede ver nada de la plataforma.',
      },
    },
    { name: 'institucion', type: 'text', label: 'Institución o servicio' },
    {
      // Permisos por módulo. La lista vacía significa «todos», no «ninguno»:
      // es lo que evita que una cuenta recién creada no vea nada sin que se
      // entienda por qué. Restringir tiene que ser un acto deliberado.
      name: 'modulosVisibles',
      type: 'select',
      hasMany: true,
      label: 'Módulos que puede ver',
      options: OPCIONES_DE_MODULO,
      admin: {
        description: 'Sin marcar ninguno, ve los cinco. Marque solo para restringir.',
      },
    },
    {
      name: 'modulosEditables',
      type: 'select',
      hasMany: true,
      label: 'Módulos que puede editar',
      options: OPCIONES_DE_MODULO,
      admin: {
        description:
          'Solo tiene efecto sobre un editor: un lector no escribe nada y un administrador lo escribe todo.',
        condition: (datos) => datos?.rol === 'editor',
      },
    },
    {
      name: 'ultimoAcceso',
      type: 'date',
      label: 'Último acceso',
      admin: {
        readOnly: true,
        description: 'Lo anota la plataforma en cada inicio de sesión.',
      },
    },
    {
      name: 'notas',
      type: 'textarea',
      label: 'Notas internas',
      admin: {
        description: 'Visible solo para administradores. Por ejemplo, quién pidió esta cuenta.',
      },
    },
  ],
}
