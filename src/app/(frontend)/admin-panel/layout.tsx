import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import {
  EnlaceConGuardia,
  GuardiaDeSalida,
  NavegacionAdmin,
  type SeccionDeMenu,
} from '@/components/admin/NavegacionAdmin'
import { GuardiaDeAtras } from '@/components/admin/GuardiaDeAtras'
import { NotasDelRevisorEnLaBarra } from '@/components/admin/NotasDelRevisorEnLaBarra'
import { BotonSalir } from '@/components/BotonSalir'
import './admin.css'
import { ruta } from '@/lib/rutas'
import { AUTORIA } from '@/lib/autoria'
import { puedeEditar } from '@/lib/guardias'
import { MODULOS } from './modulos'

export const dynamic = 'force-dynamic'

/**
 * Contorno del panel.
 *
 * Entran administrador y editor, y ven cosas distintas: el editor escribe
 * contenido, el administrador además gestiona cuentas, respaldos y sistema. La
 * navegación se arma según el rol, pero eso es comodidad, no seguridad: cada
 * página vuelve a comprobar quién entra, porque ocultar un enlace no protege
 * una ruta.
 *
 * Se usa el **rol real** y nunca el efectivo: un administrador que está mirando
 * la plataforma «como residente» sigue siendo administrador, pero nadie debe
 * poder administrar desde una simulación.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  const rol = sesion.rolReal
  if (!sesion?.usuario || !sesion.activo || (rol !== 'admin' && rol !== 'editor')) {
    redirect('/')
  }
  const esAdmin = rol === 'admin'

  // Un aviso en la barra evita que los comentarios queden meses sin leer por no
  // haber entrado a esa sección.
  //
  // Lo mismo con las solicitudes de cuenta, y con más motivo: quien pidió
  // entrar no puede hacer nada hasta que alguien la active, y no hay otro sitio
  // del panel que lo diga. Solo se cuentan para el administrador, que es el
  // único que puede resolverlas; al editor no se le enseña un número que no le
  // toca atender.
  let pendientes = 0
  let solicitudes = 0
  // La revisión del contenido (D-142): cuántas fichas esperan a quien entra
  // —asignadas a él, o sin asignar si es editor—, y para el administrador,
  // cuántas están validadas esperando que las publique.
  let porRevisar = 0
  let listas = 0
  // En una constante: la guardia de arriba estrecha `sesion.usuario`, pero ese
  // estrechamiento no llega dentro de la función que se le pasa a `filter`.
  const cuenta = sesion.usuario
  const usuarioId = String(cuenta.id)
  const misModulos = MODULOS.filter((m) => puedeEditar(cuenta, m.slug)).map((m) => m.slug)
  try {
    const payload = await getPayload({ config })
    const [conteo, conteoDeSolicitudes, conteoPorRevisar, conteoDeListas] = await Promise.all([
      payload.count({
        collection: 'comentarios',
        where: { estado: { equals: 'pendiente' } },
        overrideAccess: true,
      }),
      esAdmin
        ? payload.count({
            collection: 'usuarios',
            where: { pendiente: { equals: true } },
            overrideAccess: true,
          })
        : Promise.resolve({ totalDocs: 0 }),
      misModulos.length === 0
        ? Promise.resolve({ totalDocs: 0 })
        : payload
        .count({
          collection: 'revisiones',
          where: {
            and: [
              { estado: { in: ['pendiente', 'en-revision', 'devuelta'] } },
              { coleccion: { in: misModulos } },
              esAdmin
                ? { asignadaA: { equals: usuarioId } }
                : { or: [{ asignadaA: { equals: usuarioId } }, { asignadaA: { exists: false } }] },
            ],
          } as never,
          overrideAccess: true,
        })
        // Si la tabla de revisiones no responde, la barra se pinta igual.
        .catch(() => ({ totalDocs: 0 })),
      esAdmin
        ? payload
            .count({ collection: 'revisiones', where: { estado: { equals: 'lista' } }, overrideAccess: true })
            .catch(() => ({ totalDocs: 0 }))
        : Promise.resolve({ totalDocs: 0 }),
    ])
    pendientes = conteo.totalDocs
    solicitudes = conteoDeSolicitudes.totalDocs
    porRevisar = conteoPorRevisar.totalDocs
    listas = conteoDeListas.totalDocs
  } catch {
    // Si la base no responde, el panel debe abrirse igual para poder
    // diagnosticarlo desde la sección de sistema.
    pendientes = 0
    solicitudes = 0
  }

  const secciones: SeccionDeMenu[] = [
    {
      titulo: 'Trabajo',
      entradas: [
        { ruta: '/admin-panel', etiqueta: 'Resumen', icono: 'panel' },
        {
          ruta: '/admin-panel/revision',
          etiqueta: 'Por revisar',
          icono: 'revision',
          aviso: porRevisar || undefined,
        },
        { ruta: '/admin-panel/contenido', etiqueta: 'Contenido', icono: 'contenido' },
        { ruta: '/admin-panel/atlas', etiqueta: 'Taller anatómico', icono: 'atlas' },
        {
          ruta: '/admin-panel/comentarios',
          etiqueta: 'Comentarios',
          icono: 'comentarios',
          aviso: pendientes || undefined,
        },
      ],
    },
  ]

  if (esAdmin) {
    secciones.push({
      titulo: 'Seguimiento',
      entradas: [
        { ruta: '/admin-panel/estadisticas', etiqueta: 'Estadísticas', icono: 'estadisticas' },
        { ruta: '/admin-panel/actividad', etiqueta: 'Actividad', icono: 'actividad' },
        { ruta: '/admin-panel/registro', etiqueta: 'Registro', icono: 'registro' },
        {
          ruta: '/admin-panel/auditoria',
          etiqueta: 'Auditoría',
          icono: 'auditoria',
          aviso: listas || undefined,
        },
      ],
    })
    secciones.push({
      titulo: 'Administración',
      entradas: [
        {
          ruta: '/admin-panel/usuarios',
          etiqueta: 'Usuarios y permisos',
          icono: 'usuarios',
          aviso: solicitudes || undefined,
        },
        { ruta: '/admin-panel/difusion', etiqueta: 'Difusión', icono: 'difusion' },
        { ruta: '/admin-panel/respaldos', etiqueta: 'Respaldos', icono: 'respaldos' },
        { ruta: '/admin-panel/sistema', etiqueta: 'Sistema', icono: 'sistema' },
      ],
    })
  }

  return (
    <div className="admin-layout">
      {/* Atrás y Adelante del navegador, que no pasan ni por la barra ni por
          `beforeunload`. Aquí y solo aquí: el contorno dura lo que dura el
          panel, y dos guardias preguntarían dos veces por el mismo viaje. */}
      <GuardiaDeAtras />
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <img src={ruta('/icon.png')} alt="" className="admin-sidebar-logo" />
          <div>
            <div className="admin-sidebar-title">TraumaHub</div>
            <span className="admin-sidebar-sub">Panel de control</span>
          </div>
        </div>

        {/* Las notas del modelo para el revisor, arriba del todo y siempre a la
            vista con una ficha abierta (D-144): abajo quedaban bajo el pliegue.
            Se lee la ruta en el cliente. */}
        <NotasDelRevisorEnLaBarra />

        <NavegacionAdmin secciones={secciones} />

        {/* Todo lo que saca del panel desde esta barra pregunta antes si hay
            una ficha a medio escribir. Aquí no hay `<Link>` a secas: este
            archivo es de servidor y no puede darle a `<Link>` la función que
            pregunta, así que la ponen `EnlaceConGuardia` y `GuardiaDeSalida`
            desde el cliente. `tests/unit/salidaDelEditor.test.ts` lo vigila. */}
        <div className="admin-nav-back">
          <EnlaceConGuardia href="/" className="admin-nav-link">
            <svg
              className="admin-nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5 M12 19l-7-7 7-7" />
            </svg>
            <span className="admin-nav-texto">Volver a la plataforma</span>
          </EnlaceConGuardia>
          <div className="admin-sidebar-pie">
            <span className="admin-sidebar-quien">
              {(sesion.usuario.nombre as string) || (sesion.usuario.email as string)}
              {' · '}
              {esAdmin ? 'administrador' : 'editor'}
            </span>
            <GuardiaDeSalida>
              <BotonSalir clase="admin-salir" />
            </GuardiaDeSalida>
          </div>
          <p className="admin-sidebar-credito">
            Desarrollado por {AUTORIA.nombre} ·{' '}
            <a href={`mailto:${AUTORIA.correo}`}>{AUTORIA.correo}</a>
          </p>
        </div>
      </aside>
      <main className="admin-content">{children}</main>
    </div>
  )
}
