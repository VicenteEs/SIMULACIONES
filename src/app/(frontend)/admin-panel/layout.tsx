import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { NavegacionAdmin, type SeccionDeMenu } from '@/components/admin/NavegacionAdmin'
import { BotonSalir } from '@/components/BotonSalir'
import './admin.css'

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
  let pendientes = 0
  try {
    const payload = await getPayload({ config })
    const conteo = await payload.count({
      collection: 'comentarios',
      where: { estado: { equals: 'pendiente' } },
      overrideAccess: true,
    })
    pendientes = conteo.totalDocs
  } catch {
    // Si la base no responde, el panel debe abrirse igual para poder
    // diagnosticarlo desde la sección de sistema.
    pendientes = 0
  }

  const secciones: SeccionDeMenu[] = [
    {
      titulo: 'Trabajo',
      entradas: [
        { ruta: '/admin-panel', etiqueta: 'Resumen', icono: 'panel' },
        { ruta: '/admin-panel/contenido', etiqueta: 'Contenido', icono: 'contenido' },
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
      ],
    })
    secciones.push({
      titulo: 'Administración',
      entradas: [
        { ruta: '/admin-panel/usuarios', etiqueta: 'Usuarios y permisos', icono: 'usuarios' },
        { ruta: '/admin-panel/respaldos', etiqueta: 'Respaldos', icono: 'respaldos' },
        { ruta: '/admin-panel/sistema', etiqueta: 'Sistema', icono: 'sistema' },
      ],
    })
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <img src="/icon.png" alt="" className="admin-sidebar-logo" />
          <div>
            <div className="admin-sidebar-title">TraumaHub</div>
            <span className="admin-sidebar-sub">Panel de control</span>
          </div>
        </div>

        <NavegacionAdmin secciones={secciones} />

        <div className="admin-nav-back">
          <Link href="/" className="admin-nav-link">
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
          </Link>
          <div className="admin-sidebar-pie">
            <span className="admin-sidebar-quien">
              {(sesion.usuario.nombre as string) || (sesion.usuario.email as string)}
              {' · '}
              {esAdmin ? 'administrador' : 'editor'}
            </span>
            <BotonSalir clase="admin-salir" />
          </div>
        </div>
      </aside>
      <main className="admin-content">{children}</main>
    </div>
  )
}
