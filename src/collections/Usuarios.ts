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
 * La dirección pública de la plataforma, sin barra final, o `''` si no está
 * configurada.
 *
 * Está separada de `enlaceDeClave` para que el panel pueda preguntar si la hay
 * **antes** de pedir el testigo, y preguntárselo a la misma regla que después
 * arma el enlace. `generarEnlaceDeClave` no puede comprobarlo sobre el enlace ya
 * armado: para tenerlo necesita el testigo, y cada `forgotPassword` invalida el
 * anterior, así que fallar después dejaría muerto un enlace que a lo mejor ya
 * estaba entregado. Y si la comprobación leyera la variable por su cuenta, el
 * recorte de la barra volvería a estar escrito dos veces, que es exactamente lo
 * que produjo la barra doble de abajo.
 */
export function direccionPublica(): string {
  return (process.env.NEXT_PUBLIC_SERVER_URL || '').replace(/\/+$/, '')
}

/**
 * La dirección de la pantalla propia para elegir contraseña.
 *
 * Es la única que arma `/clave/<testigo>`, y la llaman **dos** sitios que
 * tienen que dar exactamente lo mismo: el correo de recuperación de aquí abajo
 * y el enlace que un administrador genera desde el panel cuando no hay SMTP
 * (`generarEnlaceDeClave`, en `acciones/admin.ts`). Durante un tiempo el panel
 * no la llamaba —aunque este comentario ya decía que sí— y armaba su copia a
 * mano; antes de eso, esa copia se había dejado el recorte de la barra final y
 * con `NEXT_PUBLIC_SERVER_URL=…/traumahub/` entregaba
 * `…/traumahub//clave/<testigo>`: esa dirección no casa con la ruta
 * `/clave/[testigo]`, la atiende otra página del servidor compartido y devuelve
 * un 404 que no explica nada. En esta instalación el enlace del panel no es el
 * camino alternativo sino el único, y el testigo caduca en una hora: no hay
 * margen para depurarlo. `tests/unit/enlaceDeClaveDelPanel.test.ts` falla si el
 * panel vuelve a armarlo por su cuenta.
 *
 * Aquí no interviene `ruta()`. Esto no es una ruta de la aplicación sino una
 * dirección absoluta para pegar en un mensaje, y el prefijo ya viene dentro de
 * `NEXT_PUBLIC_SERVER_URL` —que es la dirección pública completa, a diferencia
 * de `serverURL` de `payload.config.ts`, que se queda solo con el origen—.
 *
 * Sin dirección configurada devuelve una ruta relativa, `/clave/<testigo>`, que
 * no sirve para pegar en ningún mensaje. No lanza a propósito: el correo de
 * Payload la llama desde dentro de `forgotPassword`, cuando el testigo ya se
 * emitió, y lanzar ahí no salva nada. Quien pueda negarse a tiempo —el panel—
 * pregunta antes a `direccionPublica()`.
 */
export function enlaceDeClave(testigo: string): string {
  return `${direccionPublica()}/clave/${testigo}`
}

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
 * Así que se arma aquí, en español y apuntando directo a la pantalla propia,
 * con la misma `enlaceDeClave` que llama `generarEnlaceDeClave` en el panel.
 *
 * Ver O-022 en BITACORA.md.
 */
export function correoDeClaveNueva(testigo: string): string {
  const enlace = enlaceDeClave(testigo)
  return `
    <p>Alguien pidió una contraseña nueva para su cuenta de TraumaHub.</p>
    <p><a href="${enlace}">Elegir una contraseña nueva</a></p>
    <p>O copie esta dirección en el navegador:<br>${enlace}</p>
    <p>Si no fue usted, no hace falta hacer nada: la contraseña actual sigue
    siendo válida.</p>
  `
}

/**
 * Lo que se le dice a quien tiene cuenta pero todavía no la han activado.
 *
 * Está exportado porque lo dicen dos capas: el gancho de aquí abajo, que es la
 * cerradura, y `entrar()` en `acciones/sesion.ts`, que es la pantalla. Repetido
 * a mano, el día que una de las dos se matice la otra sigue diciendo lo de
 * antes y el residente lee dos explicaciones distintas del mismo portazo.
 */
export const MENSAJE_CUENTA_DESACTIVADA =
  'Su cuenta existe pero todavía no está activada. Un administrador debe habilitarla.'

/**
 * La cuenta desactivada no entra, venga por donde venga.
 *
 * La regla de D-020 —«una cuenta desactivada no ve absolutamente nada»— vivía
 * solo en `entrar()`, es decir, en la pantalla propia. Pero `payload.login` es
 * de Payload y también lo alcanza `POST /api/usuarios/login`: hasta aquí, esa
 * puerta devolvía un testigo firmado de ocho horas a una cuenta dada de baja.
 * Lo que la salvaba después era el `activo` que comprueba cada guardia al
 * resolver la sesión, no el hecho de no tener sesión, y esa es una diferencia
 * que se nota el día que alguien escriba una consulta sin esa comprobación.
 *
 * Es una clase propia y no un `Error` suelto porque `entrar()` la reconoce con
 * `instanceof` para dar su mensaje en español sin comparar el texto de la
 * excepción, que es lo que se rompe en silencio cuando alguien reescribe una
 * frase.
 *
 * Los dos campos sueltos son el contrato de Payload para que la respuesta REST
 * diga algo: `isErrorPublic` se conforma con `isPublic === true` —lo comprueba
 * por el campo, no por la clase— y sin él `routeError` cambia el mensaje por
 * «Something went wrong». No hereda de `APIError` a propósito: eso obligaría a
 * importar `payload` como **valor** desde una colección, y media docena de
 * pruebas sustituyen ese módulo por un doble con dos exportaciones; el día que
 * se añada la tercera, fallarían archivos que no tienen nada que ver con esto.
 * `formatErrors` no pide la clase: con `name` y `message` ya compone la
 * respuesta.
 *
 * El 403 y no un 401: las credenciales eran correctas. Quien lee el registro
 * del servidor tiene que poder distinguir «contraseña mala» de «cuenta de
 * baja», que se atienden de maneras muy distintas.
 */
export class CuentaDesactivada extends Error {
  readonly status = 403
  readonly isPublic = true

  constructor() {
    super(MENSAJE_CUENTA_DESACTIVADA)
    this.name = 'CuentaDesactivada'
  }
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
 *
 * Esta cuenta y la escritura que viene después son dos operaciones distintas, y
 * ninguna comprobación escrita en JavaScript puede juntarlas: dos
 * administradores que se desactivan a la vez ven cada uno al otro todavía
 * activo y los dos pasan. Esa carrera la cierra la base desde la migración
 * `20260913_043401_ultimo_administrador_activo`, con un disparador diferido que
 * vuelve a contar al confirmar la transacción. Los dos guardias de aquí siguen
 * haciendo falta y son los que se ven casi siempre: dan el mensaje en español y
 * distinguen «a sí mismo» de «al último», cosas que el disparador no sabe. El
 * disparador solo existe en el servidor —en desarrollo manda el `push` de
 * Drizzle, que no aplica migraciones—, así que a estos ganchos no se les puede
 * quitar nada por tenerlo.
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
    // La cuenta desactivada no llega a tener testigo. Ver `CuentaDesactivada`.
    //
    // Corre después de `resetLoginAttempts` y antes de `jwtSign`
    // (`auth/operations/login.js`), así que la contraseña ya se comprobó —por
    // eso el mensaje puede admitir que la cuenta existe: quien llega aquí ya la
    // conocía— y todavía no se ha firmado nada que haya que revocar.
    beforeLogin: [
      ({ user }) => {
        if ((user as { activo?: unknown } | null | undefined)?.activo !== true) {
          throw new CuentaDesactivada()
        }
        return user
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
      // Notas del administrador sobre la cuenta —quién la pidió, por qué se
      // desactivó—, no de su titular. Estuvo un tiempo sin que nadie la leyera
      // ni la escribiera, y este comentario lo advertía; ya no es así: la pinta
      // y la manda `admin-panel/usuarios/TablaUsuarios.tsx`, la aceptan
      // `crearUsuario` y la lista cerrada de `actualizarUsuario`, y
      // `tests/unit/notasDeCuenta.test.ts` vigila que el cable siga entero.
      //
      // No lleva `admin.description` porque la única interfaz que la leía era
      // la de Payload, retirada en D-038; el texto de ayuda vive junto al cuadro
      // en la pantalla de cuentas. Tampoco acceso de campo: la colección entera
      // ya es solo de administradores, que son quienes la escriben y la leen.
      name: 'notas',
      type: 'textarea',
      label: 'Notas internas',
    },
  ],
}
