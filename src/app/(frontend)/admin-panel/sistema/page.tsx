import { redirect } from 'next/navigation'
import Link from 'next/link'
import { obtenerSesion } from '@/lib/sesion'
import { tamanoLegible } from '@/lib/respaldos'
import { directorioDeRespaldos, hayPgDump, listarRespaldos } from '@/lib/respaldosServidor'
import { clientePayload } from '../datos'

export const dynamic = 'force-dynamic'

/**
 * Estado del sistema.
 *
 * Es la página que se abre cuando algo va mal, así que está escrita para
 * responder rápido a «¿qué está roto?»: base, correo, respaldos y espacio. No
 * muestra secretos —ni la contraseña de la base ni el token de sesión—, solo si
 * están puestos, porque un panel que imprime credenciales las filtra a la
 * primera captura de pantalla compartida.
 */

interface Diagnostico {
  ok: boolean
  detalle: string
}

const duracion = (segundos: number): string => {
  const d = Math.floor(segundos / 86400)
  const h = Math.floor((segundos % 86400) / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

/** Versión y peso de PostgreSQL, si el adaptador deja llegar al pool. */
async function estadoDeLaBase(payload: unknown): Promise<{ version: string; peso: string }> {
  const pool = (payload as { db?: { pool?: { query?: (sql: string) => Promise<unknown> } } }).db
    ?.pool
  if (!pool?.query) return { version: 'desconocida', peso: 'desconocido' }

  const consultar = async (sql: string): Promise<string> => {
    const resultado = (await pool.query!(sql)) as { rows?: Array<Record<string, unknown>> }
    const fila = resultado.rows?.[0]
    return fila ? String(Object.values(fila)[0]) : '—'
  }

  try {
    const [version, peso] = await Promise.all([
      consultar('select version()'),
      consultar('select pg_size_pretty(pg_database_size(current_database()))'),
    ])
    // «PostgreSQL 17.2 on x86_64-pc-linux-musl…» — basta con las dos primeras palabras.
    return { version: version.split(' ').slice(0, 2).join(' '), peso }
  } catch {
    return { version: 'sin respuesta', peso: 'desconocido' }
  }
}

export default async function PaginaSistema() {
  const sesion = await obtenerSesion()
  if (!sesion?.usuario || sesion.rolReal !== 'admin') redirect('/')

  let base: Diagnostico = { ok: false, detalle: 'sin respuesta' }
  let versionBase = 'desconocida'
  let pesoBase = 'desconocido'
  let usuarios = 0

  try {
    const payload = await clientePayload()
    const conteo = await payload.count({ collection: 'usuarios', overrideAccess: true })
    usuarios = conteo.totalDocs
    const info = await estadoDeLaBase(payload)
    versionBase = info.version
    pesoBase = info.peso
    base = { ok: true, detalle: `${versionBase} · ${pesoBase}` }
  } catch (error) {
    base = { ok: false, detalle: error instanceof Error ? error.message : 'error desconocido' }
  }

  const [respaldos, pgDump] = await Promise.all([
    listarRespaldos().catch(() => []),
    hayPgDump(),
  ])
  const ultimo = respaldos.find((r) => r.tipo === 'base')

  const correoConfigurado = Boolean(process.env.SMTP_HOST)
  const enProduccion = process.env.NODE_ENV === 'production'
  const urlPublica = process.env.NEXT_PUBLIC_SERVER_URL || '(sin definir)'
  const enHttps = urlPublica.startsWith('https://')

  const comprobaciones: Array<{ titulo: string; estado: Diagnostico }> = [
    { titulo: 'Base de datos', estado: base },
    {
      titulo: 'Respaldo reciente',
      estado: ultimo
        ? {
            ok: Date.now() - new Date(ultimo.creado).getTime() < 3 * 86_400_000,
            detalle: `${ultimo.nombre} · ${tamanoLegible(ultimo.bytes)}`,
          }
        : { ok: false, detalle: 'no hay ningún respaldo' },
    },
    {
      titulo: 'Herramienta de respaldo',
      estado: pgDump
        ? { ok: true, detalle: 'pg_dump disponible' }
        : { ok: false, detalle: 'pg_dump no está en este entorno' },
    },
    {
      titulo: 'Correo saliente',
      estado: correoConfigurado
        ? { ok: true, detalle: `${process.env.SMTP_HOST}:${process.env.SMTP_PUERTO || '587'}` }
        : {
            ok: false,
            detalle: 'sin servidor SMTP: la recuperación de contraseña no llega a destino',
          },
    },
    {
      titulo: 'Dirección pública',
      estado: {
        ok: enHttps || !enProduccion,
        detalle: enHttps
          ? urlPublica
          : `${urlPublica} — sin HTTPS la cookie de sesión viaja sin cifrar`,
      },
    },
    {
      titulo: 'Modo de ejecución',
      estado: {
        ok: true,
        detalle: enProduccion ? 'producción' : 'desarrollo (recarga en caliente)',
      },
    },
  ]

  const problemas = comprobaciones.filter((c) => !c.estado.ok).length

  return (
    <div>
      <header className="admin-header">
        <h1 className="admin-title">Sistema</h1>
        <p className="admin-subtitle">
          Estado de la instalación y sus dependencias · {usuarios} cuenta
          {usuarios === 1 ? '' : 's'} registradas
        </p>
      </header>

      {problemas === 0 ? (
        <div className="admin-aviso admin-aviso-ok">
          <strong>Todo en orden.</strong>
          Las {comprobaciones.length} comprobaciones pasan.
        </div>
      ) : (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>
            {problemas} comprobación{problemas === 1 ? '' : 'es'} requiere{problemas === 1 ? '' : 'n'}{' '}
            atención.
          </strong>
          Están marcadas más abajo. Ninguna impide usar la plataforma, pero conviene resolverlas.
        </div>
      )}

      <h2 className="admin-section-title">Comprobaciones</h2>
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Comprobación</th>
              <th>Estado</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {comprobaciones.map((c) => (
              <tr key={c.titulo}>
                <td className="admin-table-user-name">{c.titulo}</td>
                <td>
                  <span
                    className={`admin-badge ${c.estado.ok ? 'admin-badge-publicado' : 'admin-badge-pending'}`}
                  >
                    {c.estado.ok ? '✓ Correcto' : '● Revisar'}
                  </span>
                </td>
                <td style={{ fontSize: '0.8125rem' }}>{c.estado.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="admin-section-title">Entorno</h2>
      <dl className="admin-datos">
        <dt>PostgreSQL</dt>
        <dd>{versionBase}</dd>
        <dt>Tamaño de la base</dt>
        <dd>{pesoBase}</dd>
        <dt>Node.js</dt>
        <dd>{process.version}</dd>
        <dt>Plataforma</dt>
        <dd>
          {process.platform} · {process.arch}
        </dd>
        <dt>En marcha desde hace</dt>
        <dd>{duracion(process.uptime())}</dd>
        <dt>Memoria del proceso</dt>
        <dd>{tamanoLegible(process.memoryUsage().rss)}</dd>
        <dt>Directorio de respaldos</dt>
        <dd>{directorioDeRespaldos()}</dd>
        <dt>Respaldos conservados</dt>
        <dd>
          {respaldos.length} · {tamanoLegible(respaldos.reduce((t, r) => t + r.bytes, 0))}
        </dd>
        <dt>Zona horaria del servidor</dt>
        <dd>{Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
      </dl>

      <h2 className="admin-section-title">Atajos</h2>
      <div className="admin-grid">
        <div className="admin-card">
          <div className="admin-card-title">Comprobación de salud</div>
          <p className="admin-card-note">
            El extremo que consulta el despliegue para saber si la aplicación y la base responden.
          </p>
          <div className="admin-card-actions">
            <a
              href="/api/salud"
              className="admin-btn admin-btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              /api/salud ↗
            </a>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-title">Respaldos</div>
          <p className="admin-card-note">Crear, descargar o eliminar copias de la base.</p>
          <div className="admin-card-actions">
            <Link href="/admin-panel/respaldos" className="admin-btn admin-btn-secondary">
              Ir a respaldos
            </Link>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-title">CMS de Payload</div>
          <p className="admin-card-note">
            Redacción de contenido, versiones y todo lo que este panel no cubre.
          </p>
          <div className="admin-card-actions">
            <Link
              href="/admin"
              className="admin-btn admin-btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir CMS ↗
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
