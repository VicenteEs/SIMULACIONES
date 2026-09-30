import Link from 'next/link'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { capacidadesPorRol, etiquetaDeRolEnRegistro, ROLES } from '@/lib/permisos'
import { ACCIONES_DEL_REGISTRO, accionDelRegistroEnPalabras, duracionCorta } from '@/lib/registro'
import {
  leerRegistro,
  leerResumenDeCuentas,
  type FiltrosDelRegistro,
  type ResumenDelRegistro,
} from '@/lib/registroPanel'
import { ruta } from '@/lib/rutas'
import { clientePayload } from '../datos'
import { MODULOS, NOMBRE_DE_MODULO } from '../modulos'

export const dynamic = 'force-dynamic'

/**
 * El registro de lo que hace cada cuenta (D-145).
 *
 * Lo pidió el dueño: «el registro de todos los usuarios, qué hacen y cuándo,
 * con todos los permisos y roles, y calcular un tiempo de actividad». Cuatro
 * bloques, de lo que se mira primero a lo que se busca: los números del día, las
 * cuentas con sus permisos y su tiempo, lo que cada rol puede hacer, y el
 * registro acto por acto con filtros. Todo sale de las mismas lecturas que la
 * planilla de Excel (`registroPanel.ts`).
 *
 * Solo el administrador: dice qué hace cada persona.
 */

const primero = (valor: string | string[] | undefined): string | undefined => {
  const v = Array.isArray(valor) ? valor[0] : valor
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 100) : undefined
}

const fechaHora = (valor?: string | null) =>
  valor
    ? new Date(valor).toLocaleString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—'

/** Lo que se anota además de los cinco módulos. */
const NOMBRE_DEL_SITIO: Record<string, string> = {
  usuarios: 'Cuentas',
  medios: 'Medios',
  ingesta: 'Ingesta de libros',
  segmentos: 'Segmentos',
}

const modulosEnPalabras = (lista: string[]) =>
  lista.length === 0 ? 'todos' : lista.map((m) => NOMBRE_DE_MODULO[m] ?? m).join(', ')

export default async function PaginaDelRegistro({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirPanel('admin')
  const p = await searchParams
  const filtros: FiltrosDelRegistro = {
    usuario: primero(p.usuario),
    accion: primero(p.accion),
    coleccion: primero(p.coleccion),
    desde: primero(p.desde),
    hasta: primero(p.hasta),
  }
  const hayFiltro = Object.values(filtros).some(Boolean)
  const pagina = Math.max(1, Number(primero(p.pagina)) || 1)

  let resumen: ResumenDelRegistro | null = null
  let registro: Awaited<ReturnType<typeof leerRegistro>> | null = null
  try {
    const payload = await clientePayload()
    ;[resumen, registro] = await Promise.all([leerResumenDeCuentas(payload), leerRegistro(payload, filtros, pagina)])
  } catch (error) {
    console.error('[panel] no se pudo leer el registro de acciones:', error)
  }

  if (!resumen || !registro) {
    return (
      <div>
        <header className="admin-header">
          <h1 className="admin-title">Registro de acciones</h1>
        </header>
        <div className="admin-aviso admin-aviso-error">
          <strong>La base no respondió al registro.</strong>
          Lo corriente es un despliegue sin su migración (las tablas «registro_de_acciones» y
          «tiempo_activo»); el detalle queda en el registro del servidor.
        </div>
      </div>
    )
  }

  const consulta = (extra: Record<string, string | number>) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...filtros, ...extra })) if (v !== undefined && v !== '') q.set(k, String(v))
    const s = q.toString()
    return `/admin-panel/registro${s ? `?${s}` : ''}`
  }

  return (
    <div>
      <div className="admin-toolbar">
        <div>
          <h1 className="admin-title">Registro de acciones</h1>
          <p className="admin-subtitle">
            Qué hace cada cuenta, cuándo y con qué permisos. El tiempo de actividad cuenta solo mientras
            la plataforma está a la vista y alguien la toca: sin tocar nada durante 90 s, deja de contar.
          </p>
        </div>
        <div className="admin-acciones">
          <a className="admin-btn admin-btn-primary" href={ruta('/api/registro/planilla')} download>
            Descargar planilla (Excel)
          </a>
        </div>
      </div>

      <div className="auditoria-indicadores">
        <div className="admin-card">
          <div className="admin-card-title">Cuentas activas hoy</div>
          <div className="admin-card-value">{resumen.cuentasActivasHoy}</div>
          <p className="admin-card-note">con la plataforma en uso</p>
        </div>
        <div className="admin-card">
          <div className="admin-card-title">Tiempo activo hoy</div>
          <div className="admin-card-value">{duracionCorta(resumen.segundosHoy)}</div>
          <p className="admin-card-note">sumado entre todas las cuentas</p>
        </div>
        <div className="admin-card">
          <div className="admin-card-title">Acciones hoy</div>
          <div className="admin-card-value">{resumen.accionesHoy}</div>
          <p className="admin-card-note">inicios de sesión, cambios, lecturas…</p>
        </div>
      </div>

      <h2 className="admin-section-title">Cuentas, permisos y tiempo de actividad</h2>
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Rol</th>
              <th>Ve</th>
              <th>Edita</th>
              <th>Último acceso</th>
              <th>Hoy</th>
              <th>7 días</th>
              <th>30 días</th>
              <th>Días activos</th>
              <th>Sesiones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {resumen.cuentas.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.nombre}</strong>
                  <br />
                  <span className="admin-card-note">{c.correo}</span>
                  {!c.activo ? (
                    <>
                      <br />
                      <span className="admin-card-note">{c.pendiente ? 'solicitud pendiente' : 'desactivada'}</span>
                    </>
                  ) : null}
                </td>
                <td>{etiquetaDeRolEnRegistro(c.rol)}</td>
                <td>{c.rol === 'admin' ? 'todos' : modulosEnPalabras(c.modulosVisibles)}</td>
                <td>
                  {c.rol === 'lector' ? '—' : c.rol === 'admin' ? 'todos' : modulosEnPalabras(c.modulosEditables)}
                </td>
                <td>{fechaHora(c.ultimoAcceso)}</td>
                <td>{duracionCorta(c.segundosHoy)}</td>
                <td>{duracionCorta(c.segundos7d)}</td>
                <td>{duracionCorta(c.segundos30d)}</td>
                <td>{c.diasActivos30d}</td>
                <td>{c.sesiones30d}</td>
                <td>{c.acciones30d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-card-note">
        Sesiones y acciones son de los últimos 30 días. «Ve» y «Edita» vacíos significan todos los módulos.
      </p>

      <h2 className="admin-section-title">Qué puede hacer cada rol</h2>
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Permiso</th>
              {ROLES.map((r) => (
                <th key={r.value}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {capacidadesPorRol().map((c) => (
              <tr key={c.clave}>
                <td>{c.etiqueta}</td>
                <td>{c.admin ? '✓' : '—'}</td>
                <td>{c.editor ? '✓' : '—'}</td>
                <td>{c.lector ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="admin-section-title">Registro, acto por acto</h2>
      <form className="admin-filters" method="get">
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="registro-usuario">Cuenta</label>
          <select id="registro-usuario" name="usuario" className="admin-select" defaultValue={filtros.usuario ?? ''}>
            <option value="">Todas</option>
            {resumen.cuentas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="registro-accion">Acción</label>
          <select id="registro-accion" name="accion" className="admin-select" defaultValue={filtros.accion ?? ''}>
            <option value="">Todas</option>
            {ACCIONES_DEL_REGISTRO.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="registro-coleccion">Módulo</label>
          <select id="registro-coleccion" name="coleccion" className="admin-select" defaultValue={filtros.coleccion ?? ''}>
            <option value="">Todos</option>
            {MODULOS.map((m) => (
              <option key={m.slug} value={m.slug}>{m.nombre}</option>
            ))}
            <option value="usuarios">Cuentas</option>
            <option value="medios">Medios</option>
            <option value="ingesta">Ingesta</option>
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="registro-desde">Desde</label>
          <input id="registro-desde" name="desde" type="date" className="admin-select" defaultValue={filtros.desde ?? ''} />
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="registro-hasta">Hasta</label>
          <input id="registro-hasta" name="hasta" type="date" className="admin-select" defaultValue={filtros.hasta ?? ''} />
        </div>
        <button type="submit" className="admin-btn admin-btn-secondary admin-btn-sm">Aplicar</button>
        {hayFiltro ? (
          <Link href="/admin-panel/registro" className="admin-btn admin-btn-secondary admin-btn-sm">
            Quitar filtros
          </Link>
        ) : null}
      </form>

      {registro.filas.length === 0 ? (
        <div className="admin-aviso admin-aviso-info">
          <strong>{hayFiltro ? 'Nada coincide con el filtro.' : 'Todavía no hay nada registrado.'}</strong>
          {hayFiltro ? 'Quite algún filtro para ver más.' : 'Desde el despliegue de esta versión, cada inicio de sesión y cada cambio queda aquí.'}
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Cuenta</th>
                <th>Rol (entonces)</th>
                <th>Acción</th>
                <th>Dónde</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {registro.filas.map((f) => (
                <tr key={f.id}>
                  <td>{fechaHora(f.fecha)}</td>
                  <td>
                    {f.nombre || f.origen || '—'}
                    {f.correo ? (
                      <>
                        <br />
                        <span className="admin-card-note">{f.correo}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{f.rol ? etiquetaDeRolEnRegistro(f.rol) : '—'}</td>
                  <td>{accionDelRegistroEnPalabras(f.accion)}</td>
                  <td>
                    {f.coleccion ? NOMBRE_DEL_SITIO[f.coleccion] ?? NOMBRE_DE_MODULO[f.coleccion] ?? f.coleccion : '—'}
                    {f.titulo ? (
                      <>
                        <br />
                        <span className="admin-card-note">{f.titulo}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{f.detalle || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-acciones">
        <span className="admin-card-note">
          {registro.total} acto{registro.total === 1 ? '' : 's'} · página {Math.min(pagina, Math.max(1, registro.paginas))} de {Math.max(1, registro.paginas)}
        </span>
        {pagina > 1 ? (
          <Link className="admin-btn admin-btn-secondary admin-btn-sm" href={consulta({ pagina: pagina - 1 })}>
            ← Más recientes
          </Link>
        ) : null}
        {pagina < registro.paginas ? (
          <Link className="admin-btn admin-btn-secondary admin-btn-sm" href={consulta({ pagina: pagina + 1 })}>
            Más antiguos →
          </Link>
        ) : null}
      </div>
    </div>
  )
}
