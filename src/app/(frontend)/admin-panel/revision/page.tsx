import Link from 'next/link'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { puedeEditar } from '@/lib/guardias'
import { duracionEnPalabras, estadoEnPalabras, type EstadoDeRevision } from '@/lib/revision'
import { clientePayload } from '../datos'
import { MODULOS, NOMBRE_DE_MODULO } from '../modulos'

export const dynamic = 'force-dynamic'

/**
 * La cola de revisión de quien entra (D-142).
 *
 * Con cientos de fichas llegando de los libros, buscarlas módulo a módulo en
 * «Contenido» no es un flujo de trabajo. Aquí están juntas, de los módulos que
 * la cuenta puede editar: primero lo que el administrador devolvió —alguien
 * espera esa corrección—, después lo asignado a quien mira y después lo que
 * espera a cualquiera, de lo más antiguo a lo más nuevo. Cada fila lleva al
 * editor, que es donde se revisa y donde se mide.
 *
 * No enseña cuánto tardaron los demás: eso es de la auditoría, que es del
 * administrador. A cada uno sí se le dice cuánto lleva dedicado a cada ficha.
 */

const VISTAS = [
  { valor: 'por-revisar', etiqueta: 'Por revisar', estados: ['devuelta', 'pendiente', 'en-revision'] },
  { valor: 'listas', etiqueta: 'Validadas, sin publicar', estados: ['lista'] },
  { valor: 'publicadas', etiqueta: 'Publicadas', estados: ['publicada'] },
] as const

const PRIORIDAD: Record<EstadoDeRevision, number> = {
  devuelta: 0,
  pendiente: 1,
  'en-revision': 1,
  lista: 2,
  publicada: 3,
}

const fecha = (valor: unknown) =>
  typeof valor === 'string' && valor
    ? new Date(valor).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

export default async function PaginaPorRevisar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { sesion } = await exigirPanel()
  const parametros = await searchParams
  const vista = VISTAS.find((v) => v.valor === parametros.ver) ?? VISTAS[0]
  const soloMias = parametros.quien === 'mias'
  const usuarioId = String(sesion.usuario.id)
  const modulos = MODULOS.filter((m) => puedeEditar(sesion.usuario, m.slug)).map((m) => m.slug)

  const payload = await clientePayload()
  let filas: Record<string, unknown>[] = []
  let ilegible = false
  const tiempoMio = new Map<string, number>()
  try {
    const { docs } = await payload.find({
      collection: 'revisiones',
      where: {
        and: [
          { coleccion: { in: modulos } },
          { estado: { in: [...vista.estados] } },
          ...(soloMias ? [{ asignadaA: { equals: usuarioId } }] : []),
        ],
      } as never,
      limit: 1000,
      depth: 1,
      sort: 'createdAt',
      overrideAccess: true,
      pagination: false,
      select: {
        coleccion: true,
        documentoId: true,
        titulo: true,
        estado: true,
        asignadaA: true,
        libro: true,
        capitulo: true,
        paginas: true,
        lote: true,
        motivoDeDevolucion: true,
        ultimaEdicion: true,
        createdAt: true,
      },
    })
    filas = docs as unknown as Record<string, unknown>[]
    if (filas.length > 0) {
      const { docs: sesiones } = await payload.find({
        collection: 'sesiones-de-revision',
        where: { usuario: { equals: usuarioId } },
        limit: 20_000,
        depth: 0,
        overrideAccess: true,
        pagination: false,
        select: { coleccion: true, documentoId: true, segundosActivos: true },
      })
      for (const s of sesiones as unknown as Record<string, unknown>[]) {
        const clave = `${String(s.coleccion)}/${String(s.documentoId)}`
        tiempoMio.set(clave, (tiempoMio.get(clave) ?? 0) + Number(s.segundosActivos ?? 0))
      }
    }
  } catch (error) {
    console.error('[panel] no se pudo leer la cola de revisión:', error)
    ilegible = true
  }

  const idDeLaAsignada = (fila: Record<string, unknown>) => {
    const a = fila.asignadaA as Record<string, unknown> | null
    return a && typeof a === 'object' ? String(a.id) : null
  }
  const ordenadas = [...filas].sort(
    (a, b) =>
      PRIORIDAD[a.estado as EstadoDeRevision] - PRIORIDAD[b.estado as EstadoDeRevision] ||
      Number(idDeLaAsignada(b) === usuarioId) - Number(idDeLaAsignada(a) === usuarioId) ||
      String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')),
  )
  const mias = filas.filter((f) => idDeLaAsignada(f) === usuarioId).length

  const enlace = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const ver = 'ver' in cambios ? cambios.ver : vista.valor
    const quien = 'quien' in cambios ? cambios.quien : soloMias ? 'mias' : null
    if (ver && ver !== 'por-revisar') p.set('ver', ver)
    if (quien) p.set('quien', quien)
    const texto = p.toString()
    return `/admin-panel/revision${texto ? `?${texto}` : ''}`
  }

  return (
    <div>
      <header className="admin-header">
        <h1 className="admin-title">Por revisar</h1>
        <p className="admin-subtitle">
          Fichas en revisión de sus módulos · {filas.length} en esta vista
          {mias > 0 ? ` · ${mias} asignada${mias === 1 ? '' : 's'} a usted` : ''}
        </p>
      </header>

      <div className="admin-aviso admin-aviso-info">
        <strong>Cómo se revisa una ficha.</strong>
        Ábrala, cotéjela con el libro y las páginas que indica, corrija lo que haga falta y pulse
        «Listo para publicar». Mientras está abierta se registra el tiempo de revisión activa y qué
        secciones se revisan; al guardar, cuánto cambia respecto del texto original. La publica un
        administrador.
      </div>

      <nav className="auditoria-bloque" aria-label="Qué fichas ver">
        {VISTAS.map((v) =>
          v.valor === vista.valor ? (
            <strong key={v.valor}>{v.etiqueta}</strong>
          ) : (
            <Link key={v.valor} href={enlace({ ver: v.valor })}>
              {v.etiqueta}
            </Link>
          ),
        )}
        <span aria-hidden="true">·</span>
        {soloMias ? (
          <Link href={enlace({ quien: null })}>Ver las de todos</Link>
        ) : (
          <Link href={enlace({ quien: 'mias' })}>Solo las asignadas a mí</Link>
        )}
      </nav>

      {ilegible ? (
        <div className="admin-aviso admin-aviso-error">
          <strong>No se pudo leer la cola de revisión.</strong>
          El detalle queda en el registro del servidor. Mientras tanto, las fichas se pueden abrir
          desde «Contenido».
        </div>
      ) : ordenadas.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-icon">✓</div>
          <p className="admin-empty-text">
            {vista.valor === 'por-revisar' ? 'No hay nada esperando revisión.' : 'Nada en esta vista.'}
          </p>
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ficha</th>
                <th>Estado</th>
                <th>Asignada a</th>
                <th>Fuente</th>
                <th>Su revisión</th>
                <th>En revisión desde</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f) => {
                const coleccion = String(f.coleccion)
                const id = String(f.documentoId)
                const asignada = f.asignadaA as Record<string, unknown> | null
                const segundos = tiempoMio.get(`${coleccion}/${id}`) ?? 0
                return (
                  <tr key={`${coleccion}/${id}`}>
                    <th scope="row" className="admin-table-user-name">
                      <Link href={`/admin-panel/contenido/${coleccion}/${id}`}>
                        {String(f.titulo || `#${id}`)}
                      </Link>
                      <div className="revision-tenue">{NOMBRE_DE_MODULO[coleccion] ?? coleccion}</div>
                      {f.estado === 'devuelta' && f.motivoDeDevolucion ? (
                        <div className="auditoria-motivos">Devuelta: {String(f.motivoDeDevolucion)}</div>
                      ) : null}
                    </th>
                    <td>
                      <span className={`admin-badge revision-estado-${String(f.estado)}`}>
                        {estadoEnPalabras(f.estado)}
                      </span>
                    </td>
                    <td>
                      {asignada && typeof asignada === 'object'
                        ? String(asignada.id) === usuarioId
                          ? 'Usted'
                          : String(asignada.nombre || asignada.email || '')
                        : <span className="revision-tenue">sin asignar</span>}
                    </td>
                    <td>
                      {[f.libro, f.capitulo && `cap. ${String(f.capitulo)}`, f.paginas && `págs. ${String(f.paginas)}`]
                        .filter(Boolean)
                        .join(' · ') || <span className="revision-tenue">—</span>}
                    </td>
                    <td className="auditoria-numero">{segundos > 0 ? duracionEnPalabras(segundos) : '—'}</td>
                    <td>{fecha(f.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
