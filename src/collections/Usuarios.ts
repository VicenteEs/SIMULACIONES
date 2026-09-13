import type { CollectionConfig, PayloadRequest } from 'payload'
import { administracionDeUsuarios, accesoAlPanel } from '@/access/payload'
import { ajustarPrimerUsuario } from './hooks/primerUsuario'
import { impedirAutobloqueo, impedirBorradoDelUltimoAdmin } from './hooks/autobloqueo'
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
 * Cuántos administradores activos quedan además del indicado.
 *
 * La comparten los dos guardias —el de la modificación y el del borrado—
 * a propósito: cuando la consulta estaba escrita dos veces, era cuestión de
 * tiempo que una de las copias se dejara el filtro de `activo` y contara como
 * administrador a una cuenta desactivada, que es justamente la que no puede
 * rescatar a nadie.
 *
 * El `req` se pasa para que la cuenta se haga dentro de la transacción que ya
 * está abierta. Sin él, Payload abre otra contra la misma tabla que el gancho
 * está a punto de escribir.
 */
async function contarOtrosAdminsActivos(req: PayloadRequest, exceptoId: string): Promise<number> {
  const { totalDocs } = await req.payload.count({
    collection: 'usuarios',
    where: {
      and: [
        { rol: { equals: 'admin' } },
        { activo: { equals: true } },
        { id: { not_equals: exceptoId } },
      ],
    },
    req,
    overrideAccess: true,
  })
  return totalDocs
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
          contarOtrosAdmins: (exceptoId) => contarOtrosAdminsActivos(req, exceptoId),
        }),
    ],
    // Dos cosas, y el orden importa.
    //
    // Primero se comprueba que el borrado no deje la plataforma sin
    // administrador: `limpiarRastroDeUsuario` borra la actividad y anonimiza
    // los comentarios, y eso no tiene vuelta atrás. Si la comprobación fuera
    // después, un borrado rechazado ya habría dejado a la cuenta sin su
    // historial de lectura.
    //
    // Después se decide qué pasa con lo que deja: sin eso, la base rechaza el
    // borrado de cualquiera que haya leído una ficha.
    beforeDelete: [
      async ({ req, id }) => {
        // La cuenta se lee aquí porque `beforeDelete` no la trae: Payload
        // entrega este gancho solo con `id` y `req` (`BeforeDeleteHook`).
        // `disableErrors` evita convertir en excepción una cuenta que ya no
        // está —un borrado a la vez, o un `where` que no casó con nada—, que no
        // es un caso que haya que impedir.
        const cuenta = await req.payload.findByID({
          collection: 'usuarios',
          id,
          req,
          overrideAccess: true,
          depth: 0,
          disableErrors: true,
        })

        await impedirBorradoDelUltimoAdmin({
          documentoOriginal: (cuenta ?? undefined) as Record<string, unknown> | undefined,
          idDeQuienEdita: req.user?.id === undefined ? undefined : String(req.user.id),
          contarOtrosAdmins: (exceptoId) => contarOtrosAdminsActivos(req, exceptoId),
        })

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
      // Lo escribe `afterLogin` y nadie más. Sin acceso de campo, el
      // `admin: { readOnly: true }` de abajo no protegía nada: es una
      // indicación para la interfaz de Payload —retirada en D-038— y el
      // servidor nunca la miró. Lo único que filtra campos en escritura es
      // `field.access[operación]` (`fields/hooks/beforeValidate/promise.js`:
      // `if (field.access && field.access[operation])`), y sin la declaración
      // se salta la comprobación entera y guarda lo que mandó el cliente.
      //
      // Así que un `PATCH /api/usuarios/<id>` con
      // `{"ultimoAcceso": "2026-09-01T00:00:00.000Z"}` desde cualquier
      // administrador con sesión reescribía esta fecha, y es la que mira la
      // pantalla de cuentas y el recuento de activos de estadísticas para saber
      // si una cuenta sigue en uso antes de darla de baja: se acaba dando de
      // baja a quien sí entraba, o rescatando a una cuenta abandonada.
      //
      // Se cierran las dos operaciones, no solo la modificación. Payload se
      // salta el acceso de un campo cuando la operación en curso no está
      // declarada, y un `POST /api/usuarios` con la fecha puesta hacía nacer
      // «en uso» una cuenta que no ha entrado nunca.
      //
      // El caso de `ultimaVisita` en Actividad, que no lleva esto, no es el
      // mismo: allí un `beforeChange` reescribe el campo en la creación y en la
      // modificación, así que lo que mande el cliente se pierde igual. Aquí no
      // hay tal gancho; la fecha se escribe desde `afterLogin`, en una
      // operación aparte.
      //
      // El gancho no se ve afectado: escribe por la API local, donde
      // `overrideAccess` vale cierto por omisión y el acceso de campo ni se
      // evalúa.
      name: 'ultimoAcceso',
      type: 'date',
      label: 'Último acceso',
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: 'Lo anota la plataforma en cada inicio de sesión.',
      },
    },
    {
      // Hoy no lo lee ni lo escribe nadie, y conviene decirlo aquí antes de que
      // alguien cuente con él. La columna existe desde la migración inicial,
      // pero `usuarios` no está entre los slugs de `src/admin/esquema.ts`, así
      // que el editor genérico del panel no llega; la pantalla propia de
      // cuentas no lo pinta; `crearUsuario` no lo pone y `actualizarUsuario`
      // trabaja con una lista cerrada de campos que no lo incluye. La interfaz
      // de Payload, que sí lo habría mostrado, se retiró en D-038.
      //
      // Su `admin.description` prometía «visible solo para administradores», que
      // era visible para nadie: se quita para no seguir describiendo una función
      // que la plataforma no tiene. O se conecta al panel de cuentas, o se
      // retira con su migración; mientras tanto, nadie debería guardar aquí algo
      // que espere volver a ver.
      name: 'notas',
      type: 'textarea',
      label: 'Notas internas',
    },
  ],
}
