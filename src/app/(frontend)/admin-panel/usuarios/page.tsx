import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { direccionPublica } from '@/collections/Usuarios'
import { hayCorreo } from '@/correo/enviar'
import { clientePayload } from '../datos'
import { TablaUsuarios, type UsuarioDelPanel } from './TablaUsuarios'

export const dynamic = 'force-dynamic'

/** Cuántas cuentas ya revisadas se leen para la tabla. */
const TOPE_DE_CUENTAS = 500

/**
 * Cuántas solicitudes se leen para las tarjetas.
 *
 * Tiene su propio tope, más corto que el de las cuentas, porque cada tarjeta
 * lleva el texto entero de quien la pidió y la sección va encima de la tabla:
 * cien tarjetas ya son varias pantallas antes de llegar a ella. Si hay más,
 * la pantalla lo dice y las siguientes aparecen a medida que se resuelven.
 */
const TOPE_DE_SOLICITUDES = 100

/**
 * Gestión de cuentas.
 *
 * La lista se resuelve en el servidor y llega ya construida, en lugar de que el
 * navegador pida `/api/usuarios` después de pintar: la página aparece con los
 * datos puestos y no hay un instante de tabla vacía en cada visita.
 *
 * Se envía además el identificador de quien mira, porque la interfaz debe
 * desactivar las acciones que uno no puede hacerse a sí mismo. El servidor las
 * rechaza igualmente —esa es la barrera real—, pero un botón que siempre falla
 * es un botón mal puesto.
 *
 * Las cuentas y las solicitudes se leen con dos consultas, cada una con su tope.
 * Fueron una sola —quinientas cuentas por orden de correo—, y mientras solo un
 * administrador creaba cuentas el tope no se alcanzaba nunca. Con `/registro`
 * abierto al público ya no vale: pasadas las quinientas, una solicitud cuyo
 * correo caía más allá de la número quinientos no tenía tarjeta, mientras la
 * barra y el Resumen —que cuentan sin tope— seguían anunciándola; y una tanda
 * de solicitudes basura con correos que empezaran por «a» sacaba de la tabla
 * cuentas de verdad sin forma de llegar a ellas desde el panel. Separadas, lo
 * que pide cualquiera no le quita sitio a lo que un administrador ya revisó.
 */
export default async function PaginaUsuarios() {
  const { sesion } = await exigirPanel('admin')

  const payload = await clientePayload()
  const [cuentas, pedidas] = await Promise.all([
    payload.find({
      collection: 'usuarios',
      // `not_equals` y no `equals: false`: la columna admite nulos, y el
      // adaptador traduce esta comparación a «nulo o distinto de verdadero»
      // (`@payloadcms/drizzle`, `queries/parseParams.js`). Con `equals: false`,
      // una fila con la columna en nulo —escrita a mano, o por un guion que no
      // la mencione— no saldría en ninguna de las dos listas, y sería una
      // cuenta que existe y que el panel no enseña en ningún sitio.
      where: { pendiente: { not_equals: true } },
      limit: TOPE_DE_CUENTAS,
      sort: 'email',
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'usuarios',
      where: { pendiente: { equals: true } },
      limit: TOPE_DE_SOLICITUDES,
      // La más antigua primero: es la que lleva más tiempo esperando, y con una
      // tanda de solicitudes por encima del tope es la que no puede quedarse
      // fuera de la pantalla.
      sort: 'solicitadaEn',
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const aFila = (d: unknown): UsuarioDelPanel => {
    const u = d as Record<string, unknown>
    return {
      id: String(u.id),
      email: String(u.email ?? ''),
      nombre: String(u.nombre ?? ''),
      rol: (u.rol as UsuarioDelPanel['rol']) ?? 'lector',
      activo: u.activo === true,
      institucion: (u.institucion as string) ?? '',
      // La nota del administrador sobre la cuenta. Sin esta línea la tabla la
      // escribe y no la lee: el modal se abre en blanco sobre una nota que sí
      // está guardada, y quien la vea vacía la reescribe encima. Esta es la
      // única función que arma `UsuarioDelPanel`, así que no hay otro sitio
      // donde pueda entrar.
      notas: (u.notas as string) ?? '',
      creado: String(u.createdAt ?? ''),
      ultimoAcceso: (u.ultimoAcceso as string) ?? null,
      modulosVisibles: Array.isArray(u.modulosVisibles) ? (u.modulosVisibles as string[]) : [],
      modulosEditables: Array.isArray(u.modulosEditables) ? (u.modulosEditables as string[]) : [],
      // Los cuatro de la solicitud. `pendiente` se compara con `true`, que es
      // la misma pregunta que hacen el aviso de la barra y `resolverSolicitud`:
      // la columna admite nulos (la migración le pone valor por omisión, no
      // `NOT NULL`), y una cuenta que la pantalla diera por solicitud y la
      // acción no, contestaría «ya se resolvió» a cada intento.
      origen: u.origen === 'solicitud' ? 'solicitud' : 'panel',
      pendiente: u.pendiente === true,
      motivoDeSolicitud: (u.motivoDeSolicitud as string) ?? '',
      solicitadaEn: (u.solicitadaEn as string) ?? null,
    }
  }

  const solicitudes = pedidas.docs.map(aFila)

  // Las solicitudes entran también en la tabla, con su etiqueta y su filtro,
  // así que se juntan con las cuentas y se vuelven a ordenar por correo. Por
  // identificador, porque son dos lecturas: una solicitud resuelta entre las
  // dos saldría en ambas, y dos filas con la misma clave confunden a React.
  const porId = new Map<string, UsuarioDelPanel>()
  for (const fila of [...cuentas.docs.map(aFila), ...solicitudes]) porId.set(fila.id, fila)
  const usuarios = [...porId.values()].sort((a, b) => a.email.localeCompare(b.email))

  // Las dos preguntas se le hacen a las mismas funciones que usan las acciones
  // (`hayCorreo`, `direccionPublica`) y no a las variables de entorno, para que
  // la pantalla no ofrezca una invitación que la acción después rechaza: con
  // `NEXT_PUBLIC_SERVER_URL=/`, la variable está puesta y la dirección, vacía.
  return (
    <TablaUsuarios
      usuarios={usuarios}
      solicitudes={solicitudes}
      sinMostrar={{
        cuentas: Math.max(cuentas.totalDocs - cuentas.docs.length, 0),
        solicitudes: Math.max(pedidas.totalDocs - pedidas.docs.length, 0),
      }}
      idPropio={String(sesion.usuario.id)}
      hayCorreo={hayCorreo()}
      hayDireccion={Boolean(direccionPublica())}
    />
  )
}
