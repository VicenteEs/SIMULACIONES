import Link from 'next/link'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { clientePayload } from '../datos'
import { NOMBRE_DE_MODULO, rutaPublica } from '../modulos'

export const dynamic = 'force-dynamic'

const fechaHora = (valor?: string | null) =>
  valor
    ? new Date(valor).toLocaleString('es-CL', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

interface Registro {
  id: string
  usuarioId: string
  usuarioNombre: string
  usuarioCorreo: string
  coleccion: string
  documentoId: string
  completado: boolean
  ultimaVisita: string | null
}

interface PorPersona {
  usuarioId: string
  nombre: string
  correo: string
  visitadas: number
  completadas: number
  ultima: string | null
}

/**
 * Actividad de lectura.
 *
 * Responde a dos preguntas distintas y las presenta por separado, porque
 * mezclarlas no informa de nada: quién está usando la plataforma (una fila por
 * persona) y qué se está leyendo (una fila por ficha). Lo primero dice si el
 * material llega a alguien; lo segundo, qué contenido vale la pena ampliar.
 *
 * No es vigilancia del residente: son visitas a fichas de estudio, sin tiempos
 * ni recorridos. Sirve para decidir dónde poner el esfuerzo de redacción.
 */
export default async function PaginaActividad() {
  await exigirPanel('admin')

  const payload = await clientePayload()

  const { docs, totalDocs } = await payload
    .find({
      collection: 'actividad',
      limit: 1000,
      sort: '-ultimaVisita',
      depth: 1,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as unknown[], totalDocs: 0 }))

  const registros: Registro[] = (docs as Record<string, unknown>[]).map((d) => {
    const usuario = d.usuario as { id?: unknown; nombre?: string; email?: string } | null
    return {
      id: String(d.id),
      usuarioId: String(usuario?.id ?? d.usuario ?? ''),
      usuarioNombre: usuario?.nombre ?? 'Cuenta eliminada',
      usuarioCorreo: usuario?.email ?? '—',
      coleccion: String(d.coleccion ?? ''),
      documentoId: String(d.documentoId ?? ''),
      completado: d.completado === true,
      ultimaVisita: (d.ultimaVisita as string) ?? null,
    }
  })

  // Una fila por persona.
  const porPersona = new Map<string, PorPersona>()
  for (const r of registros) {
    const actual = porPersona.get(r.usuarioId) ?? {
      usuarioId: r.usuarioId,
      nombre: r.usuarioNombre,
      correo: r.usuarioCorreo,
      visitadas: 0,
      completadas: 0,
      ultima: null,
    }
    actual.visitadas += 1
    if (r.completado) actual.completadas += 1
    if (r.ultimaVisita && (!actual.ultima || r.ultimaVisita > actual.ultima)) {
      actual.ultima = r.ultimaVisita
    }
    porPersona.set(r.usuarioId, actual)
  }
  const personas = [...porPersona.values()].sort((a, b) => (b.ultima ?? '').localeCompare(a.ultima ?? ''))

  // Una fila por ficha, ordenada por número de lectores.
  const porFicha = new Map<string, { coleccion: string; documentoId: string; lectores: number; completadas: number }>()
  for (const r of registros) {
    const clave = `${r.coleccion}/${r.documentoId}`
    const actual = porFicha.get(clave) ?? {
      coleccion: r.coleccion,
      documentoId: r.documentoId,
      lectores: 0,
      completadas: 0,
    }
    actual.lectores += 1
    if (r.completado) actual.completadas += 1
    porFicha.set(clave, actual)
  }
  const fichas = [...porFicha.values()].sort((a, b) => b.lectores - a.lectores).slice(0, 20)

  return (
    <div>
      <header className="admin-header">
        <h1 className="admin-title">Actividad</h1>
        <p className="admin-subtitle">
          {totalDocs} registro{totalDocs === 1 ? '' : 's'} de lectura · {personas.length} persona
          {personas.length === 1 ? '' : 's'} han abierto alguna ficha
        </p>
      </header>

      {registros.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-icon">📖</div>
          <p className="admin-empty-text">
            Todavía nadie ha abierto una ficha. El registro empieza en cuanto una cuenta activa
            visita contenido publicado.
          </p>
        </div>
      ) : (
        <>
          <h2 className="admin-section-title">Por persona</h2>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Fichas abiertas</th>
                  <th>Marcadas como leídas</th>
                  <th>Última visita</th>
                </tr>
              </thead>
              <tbody>
                {personas.map((p) => {
                  const porcentaje =
                    p.visitadas === 0 ? 0 : Math.round((p.completadas / p.visitadas) * 100)
                  return (
                    <tr key={p.usuarioId}>
                      <td>
                        <div className="admin-table-user-name">{p.nombre}</div>
                        <div className="admin-table-user-email">{p.correo}</div>
                      </td>
                      <td>{p.visitadas}</td>
                      <td style={{ minWidth: 160 }}>
                        {p.completadas}
                        <span className="admin-numero-tenue"> · {porcentaje}%</span>
                        <div className="admin-progreso" aria-hidden="true">
                          <div
                            className="admin-progreso-relleno"
                            style={{ width: `${porcentaje}%` }}
                          />
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(p.ultima)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h2 className="admin-section-title">Fichas más leídas</h2>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Ficha</th>
                  <th>Módulo</th>
                  <th>Lectores</th>
                  <th>La dieron por leída</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fichas.map((f) => (
                  <tr key={`${f.coleccion}/${f.documentoId}`}>
                    <td className="admin-table-user-name">#{f.documentoId}</td>
                    <td>
                      <span className="admin-badge admin-badge-neutro">
                        {NOMBRE_DE_MODULO[f.coleccion] ?? f.coleccion}
                      </span>
                    </td>
                    <td>{f.lectores}</td>
                    <td>{f.completadas}</td>
                    <td>
                      <Link
                        href={rutaPublica(f.coleccion, f.documentoId)}
                        className="admin-btn admin-btn-sm admin-btn-secondary"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="admin-section-title">Últimas visitas</h2>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Ficha</th>
                  <th>Módulo</th>
                  <th>Cuándo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {registros.slice(0, 30).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="admin-table-user-name">{r.usuarioNombre}</div>
                      <div className="admin-table-user-email">{r.usuarioCorreo}</div>
                    </td>
                    <td>
                      <Link href={rutaPublica(r.coleccion, r.documentoId)}>#{r.documentoId}</Link>
                    </td>
                    <td>
                      <span className="admin-badge admin-badge-neutro">
                        {NOMBRE_DE_MODULO[r.coleccion] ?? r.coleccion}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(r.ultimaVisita)}</td>
                    <td>
                      <span
                        className={`admin-badge ${r.completado ? 'admin-badge-publicado' : 'admin-badge-neutro'}`}
                      >
                        {r.completado ? '✓ Leída' : 'En curso'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
