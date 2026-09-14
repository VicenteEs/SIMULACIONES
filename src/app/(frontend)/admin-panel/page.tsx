import Link from 'next/link'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { puedeEditar } from '@/lib/guardias'
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
 * Responde de un vistazo a las preguntas que se hacen al entrar: qué hay
 * publicado y qué está a medias, qué falta por atender y —si quien mira es el
 * administrador— quién tiene acceso, qué se está leyendo y cuándo fue el
 * último respaldo. Esa última tarjeta importa porque el día que haga falta
 * será tarde para descubrir que el último es de hace dos meses.
 */
export default async function ResumenAdmin() {
  // Entra también el editor. La barra lateral le ofrece «Resumen» desde el
  // primer día, pero esta página exigía administrador y lo devolvía al inicio:
  // su primer clic en el panel terminaba fuera del panel. Lo que ve es lo suyo
  // —qué hay publicado, qué está a medias y qué se ha comentado—; las cuentas,
  // los respaldos y la lectura son del administrador y no se le muestran.
  const { sesion, esAdmin } = await exigirPanel()

  const payload = await clientePayload()

  const [usuarios, comentarios, todosLosModulos, actividad, respaldos, solicitudes] =
    await Promise.all([
      esAdmin ? resumenDeUsuarios(payload) : null,
      resumenDeComentarios(payload),
      conteosPorModulo(payload),
      esAdmin ? resumenDeActividad(payload) : null,
      esAdmin ? listarRespaldos().catch(() => []) : [],
      // Solo para el administrador, que es quien puede resolverlas: al editor
      // no se le enseña un número que no le toca atender, igual que en la
      // barra. Si la base no contesta se queda en cero, sin aviso propio: la
      // tarjeta de cuentas, que lee la misma tabla, ya sale ilegible y levanta
      // el aviso general de arriba.
      esAdmin
        ? payload
            .count({
              collection: 'usuarios',
              where: { pendiente: { equals: true } },
              overrideAccess: true,
            })
            .then((conteo) => conteo.totalDocs)
            .catch(() => 0)
        : 0,
    ])

  // Un editor con módulos asignados cuenta y ve los suyos: un resumen que suma
  // fichas que no puede tocar no le sirve para saber qué le queda por hacer.
  const modulos = todosLosModulos.filter((m) => puedeEditar(sesion.usuario, m.slug))

  // Los conteos que la base no supo responder vienen a cero y con `ilegible`
  // en alto (`datos.ts`). Sumarlos como ceros da un total que parece un
  // recuento y no lo es: si falla la tabla de patologías, «Contenido
  // publicado» baja sola y lo razonable es concluir que se perdió contenido.
  // Se suma solo lo que se pudo leer y se dice cuántos módulos faltan.
  const legibles = modulos.filter((m) => !m.ilegible)
  const modulosIlegibles = modulos.filter((m) => m.ilegible)
  const publicados = legibles.reduce((total, m) => total + m.publicados, 0)
  const borradores = legibles.reduce((total, m) => total + m.borradores, 0)
  const hayIlegibles =
    modulosIlegibles.length > 0 ||
    comentarios.ilegible ||
    usuarios?.ilegible === true ||
    actividad?.ilegible === true
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

  // Las cinco filas de abajo decían el módulo —«Biblioteca de patologías» en
  // todas— y nunca de qué ficha hablaban: eso vive en `documentoId`, que en
  // `Comentarios` es un texto suelto y no una relación, así que la profundidad
  // con la que se leen trae al autor pero nunca el documento. Son cinco
  // consultas de profundidad 0 en una página que ya es `force-dynamic`, cada
  // una por su cuenta: la ficha pudo borrarse y el comentario sigue aquí.
  const titulosDeFichas = new Map<string, string>()
  await Promise.all(
    pendientes.docs.map(async (documento) => {
      const c = documento as { coleccion?: string; documentoId?: string }
      if (!c.coleccion || !c.documentoId) return
      try {
        const doc = (await payload.findByID({
          collection: c.coleccion as never,
          id: c.documentoId,
          depth: 0,
          overrideAccess: true,
        })) as Record<string, unknown> | null
        const nombre = doc?.nombre ?? doc?.titulo
        if (typeof nombre === 'string' && nombre.trim() !== '') {
          titulosDeFichas.set(`${c.coleccion}/${c.documentoId}`, nombre)
        }
      } catch {
        // La ficha ya no está: la fila se queda con el nombre del módulo.
      }
    }),
  )

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

      {/* Lo primero de la página, por encima del respaldo: quien pidió la
          cuenta está esperando ahora, sin poder hacer nada ni saber a quién
          preguntar, y la barra lateral solo enseña un número pequeño junto a
          una entrada que no se abre si no se va a hacer algo con las cuentas. */}
      {esAdmin && solicitudes > 0 ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>
            {solicitudes === 1
              ? '1 solicitud de cuenta espera revisión.'
              : `${solicitudes} solicitudes de cuenta esperan revisión.`}
          </strong>
          {solicitudes === 1
            ? ' Quien la pidió no puede entrar hasta que un administrador la active o la rechace en '
            : ' Quienes las pidieron no pueden entrar hasta que un administrador las active o las rechace en '}
          <Link href="/admin-panel/usuarios">Usuarios y permisos</Link>.
        </div>
      ) : null}

      {!esAdmin ? null : diasSinRespaldo === null ? (
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

      {/* Una tabla que no responde se veía exactamente igual que un módulo
          recién instalado: tarjeta a cero, barra al 0 % y «sin contenido aún».
          El dato para distinguirlos existe desde que `datos.ts` dejó de
          confundir «cero» con «no se pudo leer», y hasta aquí no lo miraba
          nadie. El aviso va arriba del todo porque cambia cómo se leen todos
          los números de esta pantalla. */}
      {hayIlegibles ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>La base no respondió a parte de este resumen.</strong>
          Donde aparece «—» no hay un cero: es un recuento que no se pudo hacer
          {modulosIlegibles.length > 0
            ? ` (${modulosIlegibles.map((m) => m.nombre).join(', ')})`
            : ''}
          . Lo corriente es que falte una tabla —un cambio de esquema desplegado sin su
          migración—; el detalle queda en el registro del servidor.
        </div>
      ) : null}

      <div className="admin-grid">
        {usuarios ? (
          <div className={`admin-card${usuarios.ilegible ? ' admin-card-ilegible' : ''}`}>
            <div className="admin-card-title">Cuentas con acceso</div>
            <div className="admin-card-value">
              {usuarios.ilegible ? (
                '—'
              ) : (
                <>
                  {usuarios.activos}
                  <span className="admin-numero-tenue"> / {usuarios.total}</span>
                </>
              )}
            </div>
            <p className="admin-card-note">
              {usuarios.ilegible ? (
                'no se pudo leer la tabla de cuentas'
              ) : (
                <>
                  {usuarios.admins} administrador{usuarios.admins === 1 ? '' : 'es'} ·{' '}
                  {usuarios.editores} editor{usuarios.editores === 1 ? '' : 'es'} ·{' '}
                  {usuarios.lectores} lector{usuarios.lectores === 1 ? '' : 'es'}
                  {/* Las solicitudes también están sin activar, pero no son
                      bajas, y ya tienen su aviso arriba: contadas aquí dos
                      veces, «3 sin activar» hacía buscar tres bajas donde
                      había una. `Math.max` porque los dos conteos son
                      consultas distintas, y entre ambas pudo llegar otra. */}
                  {Math.max(usuarios.inactivos - solicitudes, 0) > 0
                    ? ` · ${Math.max(usuarios.inactivos - solicitudes, 0)} sin activar`
                    : ''}
                  {solicitudes > 0
                    ? ` · ${solicitudes} solicitud${solicitudes === 1 ? '' : 'es'}`
                    : ''}
                </>
              )}
            </p>
            <div className="admin-card-actions">
              <Link href="/admin-panel/usuarios" className="admin-btn admin-btn-secondary">
                Gestionar cuentas
              </Link>
            </div>
          </div>
        ) : null}

        <div className="admin-card">
          <div className="admin-card-title">Contenido publicado</div>
          <div className="admin-card-value">{publicados}</div>
          <p className="admin-card-note">
            {borradores > 0
              ? `${borradores} borrador${borradores === 1 ? '' : 'es'} sin publicar`
              : 'sin borradores pendientes'}
            {modulosIlegibles.length > 0
              ? ` · sin contar ${modulosIlegibles.length} módulo${
                  modulosIlegibles.length === 1 ? '' : 's'
                } que no se ${modulosIlegibles.length === 1 ? 'pudo' : 'pudieron'} leer`
              : ''}
          </p>
          <div className="admin-card-actions">
            <Link href="/admin-panel/contenido" className="admin-btn admin-btn-secondary">
              Ver contenido
            </Link>
          </div>
        </div>

        <div className={`admin-card${comentarios.ilegible ? ' admin-card-ilegible' : ''}`}>
          <div className="admin-card-title">Comentarios pendientes</div>
          <div
            className="admin-card-value"
            style={{
              color:
                !comentarios.ilegible && comentarios.pendientes > 0 ? 'var(--ambar)' : undefined,
            }}
          >
            {comentarios.ilegible ? (
              '—'
            ) : (
              <>
                {comentarios.pendientes}
                <span className="admin-numero-tenue"> / {comentarios.total}</span>
              </>
            )}
          </div>
          <p className="admin-card-note">
            {comentarios.ilegible
              ? 'no se pudo leer la tabla de comentarios'
              : 'retroalimentación recibida en las fichas'}
          </p>
          <div className="admin-card-actions">
            <Link href="/admin-panel/comentarios" className="admin-btn admin-btn-secondary">
              Revisar
            </Link>
          </div>
        </div>

        {actividad ? (
          <div className={`admin-card${actividad.ilegible ? ' admin-card-ilegible' : ''}`}>
            <div className="admin-card-title">Lectura de los últimos 7 días</div>
            <div className="admin-card-value">
              {actividad.ilegible ? '—' : actividad.ultimos7dias}
            </div>
            <p className="admin-card-note">
              {actividad.ilegible ? (
                // Un cero aquí se lee como «nadie entró esta semana», que es
                // una conclusión sobre los residentes y no sobre la base.
                'no se pudo leer el registro de lectura'
              ) : (
                <>
                  fichas abiertas por {actividad.lectoresActivos7dias} persona
                  {actividad.lectoresActivos7dias === 1 ? '' : 's'} · {actividad.completados}{' '}
                  marcadas como leídas
                </>
              )}
            </p>
            <div className="admin-card-actions">
              <Link href="/admin-panel/actividad" className="admin-btn admin-btn-secondary">
                Ver actividad
              </Link>
            </div>
          </div>
        ) : null}

        {esAdmin ? (
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
        ) : null}
      </div>

      <h2 className="admin-section-title">Contenido por módulo</h2>
      <div className="admin-grid">
        {modulos.map((m) => {
          const porcentaje = m.total === 0 ? 0 : Math.round((m.publicados / m.total) * 100)
          return (
            <div key={m.slug} className={`admin-card${m.ilegible ? ' admin-card-ilegible' : ''}`}>
              <div className="admin-card-numero">{m.numero}</div>
              <div className="admin-card-title">{m.nombre}</div>
              <div className="admin-card-value" style={{ fontSize: '2rem' }}>
                {m.ilegible ? (
                  '—'
                ) : (
                  <>
                    {m.publicados}
                    {m.borradores > 0 ? (
                      <span className="admin-numero-tenue"> +{m.borradores} borr.</span>
                    ) : null}
                  </>
                )}
              </div>
              {/* La barra al 0 % sobre un módulo ilegible es la mitad del
                  engaño: dibuja un dato que no se tiene. */}
              {m.ilegible ? null : (
                <div className="admin-progreso" aria-hidden="true">
                  <div className="admin-progreso-relleno" style={{ width: `${porcentaje}%` }} />
                </div>
              )}
              <p className="admin-card-note">
                {m.ilegible
                  ? 'no se pudo leer este módulo'
                  : m.total === 0
                    ? 'sin contenido aún'
                    : `${porcentaje}% publicado`}
              </p>
              <div className="admin-card-actions">
                {/* Apuntaba a `/admin/collections/…`, que es la interfaz de
                    Payload: se retiró de esta plataforma y esa ruta hoy solo
                    reenvía al panel. El botón abría una pestaña nueva, prometía
                    el módulo y entregaba la portada del panel. */}
                <Link
                  href={`/admin-panel/contenido/${m.slug}`}
                  className="admin-btn admin-btn-secondary"
                >
                  Editar
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
                  const tituloDeFicha = titulosDeFichas.get(
                    `${comentario.coleccion}/${comentario.documentoId}`,
                  )
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
                        {tituloDeFicha ? (
                          <div className="admin-table-user-email">{tituloDeFicha}</div>
                        ) : null}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {comentario.createdAt ? fecha(comentario.createdAt) : '—'}
                      </td>
                      <td>
                        {/* «Editar» y al editor del panel: un comentario
                            pendiente se atiende corrigiendo la ficha, y desde
                            la ruta pública eso costaba volver a Panel,
                            Contenido, el módulo y buscarla por nombre. El
                            editor además abre esté publicada o retirada. */}
                        {comentario.coleccion && comentario.documentoId ? (
                          <div className="admin-acciones">
                            <Link
                              href={`/admin-panel/contenido/${comentario.coleccion}/${comentario.documentoId}`}
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                            >
                              Editar
                            </Link>
                            <Link
                              href={rutaPublica(comentario.coleccion, comentario.documentoId)}
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                            >
                              Ver ficha
                            </Link>
                          </div>
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
