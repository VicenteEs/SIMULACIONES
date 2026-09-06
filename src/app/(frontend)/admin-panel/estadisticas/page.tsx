import { redirect } from 'next/navigation'
import type { Payload } from 'payload'
import { obtenerSesion } from '@/lib/sesion'
import { BarraApilada, BarrasHorizontales, BarrasVerticales, type Punto } from '@/components/admin/Graficos'
import { clientePayload } from '../datos'
import { MODULOS, NOMBRE_DE_MODULO } from '../modulos'

export const dynamic = 'force-dynamic'

/**
 * Estadísticas de la plataforma.
 *
 * Responde a tres preguntas y ninguna más, porque un panel de métricas que
 * responde a treinta no se mira: cuánto contenido hay y a qué ritmo crece,
 * quién lo está leyendo, y qué material pide atención.
 *
 * Todo se calcula sobre lecturas acotadas y en paralelo: la página tiene que
 * abrir rápido o dejará de abrirse.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Las últimas doce claves de mes, de la más antigua a la más reciente. */
function ultimosDoceMeses(): { clave: string; etiqueta: string; detalle: string }[] {
  const hoy = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - (11 - i), 1)
    return {
      clave: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`,
      etiqueta: MESES[fecha.getMonth()],
      detalle: `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`,
    }
  })
}

const claveDeMes = (iso: unknown): string | null => {
  if (typeof iso !== 'string') return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

/** Fechas de creación de todos los documentos de una colección. */
async function fechasDeCreacion(payload: Payload, slug: string): Promise<string[]> {
  try {
    const { docs } = await payload.find({
      collection: slug as never,
      limit: 2000,
      depth: 0,
      draft: true,
      sort: 'createdAt',
      overrideAccess: true,
    })
    return (docs as Record<string, unknown>[])
      .map((d) => d.createdAt)
      .filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}

export default async function PaginaEstadisticas() {
  const sesion = await obtenerSesion()
  if (!sesion?.usuario || sesion.rolReal !== 'admin') redirect('/')

  const payload = await clientePayload()
  const meses = ultimosDoceMeses()

  const [porModulo, actividad, comentarios, usuarios] = await Promise.all([
    Promise.all(
      MODULOS.map(async (m) => ({
        slug: m.slug,
        nombre: m.nombre,
        fechas: await fechasDeCreacion(payload, m.slug),
      })),
    ),
    payload
      .find({
        collection: 'actividad',
        limit: 2000,
        depth: 0,
        sort: '-ultimaVisita',
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as unknown[] })),
    payload
      .find({ collection: 'comentarios', limit: 1000, depth: 0, overrideAccess: true })
      .catch(() => ({ docs: [] as unknown[] })),
    payload
      .find({ collection: 'usuarios', limit: 500, depth: 0, overrideAccess: true })
      .catch(() => ({ docs: [] as unknown[] })),
  ])

  // --- contenido creado por mes -------------------------------------------
  const todasLasFechas = porModulo.flatMap((m) => m.fechas)
  const creadoPorMes: Punto[] = meses.map((mes) => ({
    etiqueta: mes.etiqueta,
    detalle: mes.detalle,
    valor: todasLasFechas.filter((f) => claveDeMes(f) === mes.clave).length,
  }))

  // --- lectura ------------------------------------------------------------
  const registros = actividad.docs as Record<string, unknown>[]
  const lecturaPorModulo: Punto[] = MODULOS.map((m) => ({
    etiqueta: m.nombre,
    valor: registros.filter((r) => r.coleccion === m.slug).length,
  })).sort((a, b) => b.valor - a.valor)

  const visitasPorMes: Punto[] = meses.map((mes) => ({
    etiqueta: mes.etiqueta,
    detalle: mes.detalle,
    valor: registros.filter((r) => claveDeMes(r.ultimaVisita) === mes.clave).length,
  }))

  const fichasMasLeidas: Punto[] = Object.entries(
    registros.reduce<Record<string, number>>((cuenta, r) => {
      const clave = `${r.coleccion}/${r.documentoId}`
      cuenta[clave] = (cuenta[clave] ?? 0) + 1
      return cuenta
    }, {}),
  )
    .map(([clave, valor]) => {
      const [coleccion, documento] = clave.split('/')
      return {
        etiqueta: `${NOMBRE_DE_MODULO[coleccion] ?? coleccion} · #${documento}`,
        valor,
      }
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8)

  // --- comentarios --------------------------------------------------------
  const listaComentarios = comentarios.docs as Record<string, unknown>[]
  const comentariosPorModulo: Punto[] = MODULOS.map((m) => ({
    etiqueta: m.nombre,
    valor: listaComentarios.filter((c) => c.coleccion === m.slug).length,
  })).sort((a, b) => b.valor - a.valor)

  const pendientes = listaComentarios.filter((c) => c.estado === 'pendiente').length

  // --- cuentas ------------------------------------------------------------
  const listaUsuarios = usuarios.docs as Record<string, unknown>[]
  const cuenta = (rol: string) => listaUsuarios.filter((u) => u.rol === rol).length
  const activos = listaUsuarios.filter((u) => u.activo === true).length

  const hace30dias = Date.now() - 30 * 86_400_000
  const entraronEsteMes = listaUsuarios.filter(
    (u) => typeof u.ultimoAcceso === 'string' && new Date(u.ultimoAcceso).getTime() > hace30dias,
  ).length

  const totalFichas = todasLasFechas.length
  const totalVisitas = registros.length

  return (
    <div>
      <header className="admin-header">
        <h1 className="admin-title">Estadísticas</h1>
        <p className="admin-subtitle">
          {totalFichas} ficha{totalFichas === 1 ? '' : 's'} escritas · {totalVisitas} lectura
          {totalVisitas === 1 ? '' : 's'} registradas · {activos} cuenta
          {activos === 1 ? '' : 's'} con acceso
        </p>
      </header>

      <h2 className="admin-section-title">Cuánto contenido hay y cómo crece</h2>
      <div className="admin-grid">
        <div className="admin-card admin-card-ancha">
          <div className="admin-card-title">Fichas creadas por mes</div>
          <p className="admin-card-note">Últimos doce meses, todos los módulos juntos.</p>
          <BarrasVerticales datos={creadoPorMes} titulo="Fichas creadas por mes" />
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Reparto por módulo</div>
          <div className="admin-card-value" style={{ fontSize: '2rem' }}>
            {totalFichas}
          </div>
          <BarrasHorizontales
            titulo="Fichas por módulo"
            datos={porModulo
              .map((m) => ({ etiqueta: m.nombre, valor: m.fechas.length }))
              .sort((a, b) => b.valor - a.valor)}
          />
        </div>
      </div>

      <h2 className="admin-section-title">Quién lo está leyendo</h2>
      <div className="admin-grid">
        <div className="admin-card admin-card-ancha">
          <div className="admin-card-title">Lecturas por mes</div>
          <p className="admin-card-note">
            Cada barra cuenta las fichas visitadas en ese mes, no las visitas repetidas.
          </p>
          <BarrasVerticales datos={visitasPorMes} titulo="Lecturas por mes" />
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Módulos más leídos</div>
          <BarrasHorizontales titulo="Lecturas por módulo" datos={lecturaPorModulo} />
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Cuentas</div>
          <div className="admin-card-value" style={{ fontSize: '2rem' }}>
            {activos}
            <span className="admin-numero-tenue"> de {listaUsuarios.length}</span>
          </div>
          <p className="admin-card-note">
            {entraronEsteMes} han entrado en los últimos 30 días
          </p>
          <BarraApilada
            titulo="Cuentas por rol"
            partes={[
              { etiqueta: 'Administradores', valor: cuenta('admin'), color: 'var(--marca-honda)' },
              { etiqueta: 'Editores', valor: cuenta('editor'), color: 'var(--marca)' },
              { etiqueta: 'Lectores', valor: cuenta('lector'), color: '#8fb6e8' },
            ]}
          />
        </div>
      </div>

      {fichasMasLeidas.length > 0 ? (
        <>
          <h2 className="admin-section-title">Qué se lee más</h2>
          <div className="admin-card admin-card-ancha">
            <BarrasHorizontales titulo="Fichas más leídas" datos={fichasMasLeidas} />
          </div>
        </>
      ) : null}

      <h2 className="admin-section-title">Qué pide atención</h2>
      <div className="admin-grid">
        <div className="admin-card">
          <div className="admin-card-title">Comentarios sin resolver</div>
          <div
            className="admin-card-value"
            style={{ color: pendientes > 0 ? 'var(--ambar)' : undefined }}
          >
            {pendientes}
          </div>
          <p className="admin-card-note">de {listaComentarios.length} recibidos en total</p>
        </div>

        <div className="admin-card admin-card-ancha">
          <div className="admin-card-title">Dónde se comenta</div>
          <p className="admin-card-note">
            El módulo con más comentarios suele ser el que más falta le hace crecer.
          </p>
          <BarrasHorizontales titulo="Comentarios por módulo" datos={comentariosPorModulo} />
        </div>
      </div>
    </div>
  )
}
