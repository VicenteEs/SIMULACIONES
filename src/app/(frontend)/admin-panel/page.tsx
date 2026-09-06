import { redirect } from 'next/navigation'
import Link from 'next/link'
import { obtenerSesion } from '@/lib/sesion'
import { tamanoLegible } from '@/lib/respaldos'
import { listarRespaldos } from '@/lib/respaldosServidor'
import {
  clientePayload,
  conteosPorModulo,
  resumenDeActividad,
  resumenDeComentarios,
  resumenDeUsuarios,
  rutaPublica,
  NOMBRE_DE_MODULO,
} from './datos'

export const dynamic = 'force-dynamic'

const fecha = (valor: string | Date) =>
  new Date(valor).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })

/**
 * Resumen del panel.
 *
 * Responde de un vistazo a las cuatro preguntas que se hacen al entrar: quién
 * tiene acceso, qué hay publicado y qué está a medias, qué se está leyendo, y
 * qué falta por atender. La última tarjeta es la del respaldo, porque el día
 * que importe será tarde para descubrir que el último es de hace dos meses.
 */
export default async function ResumenAdmin() {
  const sesion = await obtenerSesion()
  if (!sesion?.usuario || sesion.rolReal !== 'admin') redirect('/')

  const payload = await clientePayload()

  const [usuarios, comentarios, modulos, actividad, respaldos] = await Promise.all([
    resumenDeUsuarios(payload),
    resumenDeComentarios(payload),
    conteosPorModulo(payload),
    resumenDeActividad(payload),
    listarRespaldos().catch(() => []),
  ])

  const publicados = modulos.reduce((total, m) => total + m.publicados, 0)
  const borradores = modulos.reduce((total, m) => total + m.borradores, 0)
  const ultimoRespaldo = respaldos.find((r) => r.tipo === 'base')
  const diasSinRespaldo = ultimoRespaldo
    ? Math.floor((Date.now() - new Date(ultimoRespaldo.creado).getTime()) / 86_400_000)
    : null

  const pendientes = await payload
    .find({
      collection: 'comentarios',
      where: { estado: { equals: 'pendiente' } },
      sort: '-createdAt',
      limit: 5,
      depth: 1,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  return (
    <div>
      <header className="admin-header">
        <h1 className="admin-title">Resumen</h1>
        <p className="admin-subtitle">
          Estado general de la plataforma · {new Date().toLocaleDateString('es-CL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>

      {diasSinRespaldo === null ? (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>No hay ningún respaldo de la base de datos.</strong>
          Cree el primero desde <Link href="/admin-panel/respaldos">Respaldos</Link>; en el
          servidor, además, se programa uno diario al desplegar.
        </div>
      ) : diasSinRespaldo > 2 ? (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>El último respaldo tiene {diasSinRespaldo} días.</strong>
          Compruebe que la tarea diaria del servidor esté corriendo, o cree uno ahora desde{' '}
          <Link href="/admin-panel/respaldos">Respaldos</Link>.
        </div>
      ) : null}

      <div className="admin-grid">
        <div className="admin-card">
          <div className="admin-card-title">Cuentas con acceso</div>
          <div className="admin-card-value">
            {usuarios.activos}
            <span className="admin-numero-tenue"> / {usuarios.total}</span>
          </div>
          <p className="admin-card-note">
            {usuarios.admins} administrador{usuarios.admins === 1 ? '' : 'es'} ·{' '}
            {usuarios.editores} editor{usuarios.editores === 1 ? '' : 'es'} · {usuarios.lectores}{' '}
            lector{usuarios.lectores === 1 ? '' : 'es'}
            {usuarios.inactivos > 0 ? ` · ${usuarios.inactivos} sin activar` : ''}
          </p>
          <div className="admin-card-actions">
            <Link href="/admin-panel/usuarios" className="admin-btn admin-btn-secondary">
              Gestionar cuentas
            </Link>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Contenido publicado</div>
          <div className="admin-card-value">{publicados}</div>
          <p className="admin-card-note">
            {borradores > 0
              ? `${borradores} borrador${borradores === 1 ? '' : 'es'} sin publicar`
              : 'sin borradores pendientes'}
          </p>
          <div className="admin-card-actions">
            <Link href="/admin-panel/contenido" className="admin-btn admin-btn-secondary">
              Ver contenido
            </Link>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Comentarios pendientes</div>
          <div
            className="admin-card-value"
            style={{ color: comentarios.pendientes > 0 ? 'var(--ambar)' : undefined }}
          >
            {comentarios.pendientes}
            <span className="admin-numero-tenue"> / {comentarios.total}</span>
          </div>
          <p className="admin-card-note">retroalimentación recibida en las fichas</p>
          <div className="admin-card-actions">
            <Link href="/admin-panel/comentarios" className="admin-btn admin-btn-secondary">
              Revisar
            </Link>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Lectura de los últimos 7 días</div>
          <div className="admin-card-value">{actividad.ultimos7dias}</div>
          <p className="admin-card-note">
            fichas abiertas por {actividad.lectoresActivos7dias} persona
            {actividad.lectoresActivos7dias === 1 ? '' : 's'} · {actividad.completados} marcadas
            como leídas
          </p>
          <div className="admin-card-actions">
            <Link href="/admin-panel/actividad" className="admin-btn admin-btn-secondary">
              Ver actividad
            </Link>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Último respaldo</div>
          <div className="admin-card-value" style={{ fontSize: '1.5rem' }}>
            {ultimoRespaldo ? fecha(ultimoRespaldo.creado) : 'ninguno'}
          </div>
          <p className="admin-card-note">
            {ultimoRespaldo
              ? `${tamanoLegible(ultimoRespaldo.bytes)} · ${respaldos.length} archivo${
                  respaldos.length === 1 ? '' : 's'
                } conservado${respaldos.length === 1 ? '' : 's'}`
              : 'la base no se ha respaldado nunca'}
          </p>
          <div className="admin-card-actions">
            <Link href="/admin-panel/respaldos" className="admin-btn admin-btn-secondary">
              Respaldos
            </Link>
          </div>
        </div>
      </div>

      <h2 className="admin-section-title">Contenido por módulo</h2>
      <div className="admin-grid">
        {modulos.map((m) => {
          const porcentaje = m.total === 0 ? 0 : Math.round((m.publicados / m.total) * 100)
          return (
            <div key={m.slug} className="admin-card">
              <div className="admin-card-numero">{m.numero}</div>
              <div className="admin-card-title">{m.nombre}</div>
              <div className="admin-card-value" style={{ fontSize: '2rem' }}>
                {m.publicados}
                {m.borradores > 0 ? (
                  <span className="admin-numero-tenue"> +{m.borradores} borr.</span>
                ) : null}
              </div>
              <div className="admin-progreso" aria-hidden="true">
                <div className="admin-progreso-relleno" style={{ width: `${porcentaje}%` }} />
              </div>
              <p className="admin-card-note">
                {m.total === 0 ? 'sin contenido aún' : `${porcentaje}% publicado`}
              </p>
              <div className="admin-card-actions">
                <Link
                  href={`/admin/collections/${m.slug}`}
                  className="admin-btn admin-btn-secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Editar ↗
                </Link>
                <Link href={m.ruta} className="admin-btn admin-btn-primary">
                  Ver público →
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {pendientes.docs.length > 0 ? (
        <>
          <h2 className="admin-section-title">Últimos comentarios sin resolver</h2>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Comentario</th>
                  <th>Módulo</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendientes.docs.map((c) => {
                  const comentario = c as {
                    id: string | number
                    texto?: string
                    coleccion?: string
                    documentoId?: string
                    createdAt?: string
                    usuario?: { nombre?: string; email?: string }
                  }
                  return (
                    <tr key={String(comentario.id)}>
                      <td>
                        <div className="admin-table-user-name">
                          {comentario.usuario?.nombre ?? 'Usuario'}
                        </div>
                        <div className="admin-table-user-email">
                          {comentario.usuario?.email ?? '—'}
                        </div>
                      </td>
                      <td className="admin-table-text">{comentario.texto}</td>
                      <td>
                        <span className="admin-badge admin-badge-neutro">
                          {NOMBRE_DE_MODULO[comentario.coleccion ?? ''] ?? comentario.coleccion}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {comentario.createdAt ? fecha(comentario.createdAt) : '—'}
                      </td>
                      <td>
                        {comentario.coleccion && comentario.documentoId ? (
                          <Link
                            href={rutaPublica(comentario.coleccion, comentario.documentoId)}
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                          >
                            Ver ficha
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
