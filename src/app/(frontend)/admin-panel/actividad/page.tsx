import Link from 'next/link'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { NOMBRE_DEL_DESENLACE } from '@/lib/progresoDelSimulador'
import { clientePayload, resumenDeActividad } from '../datos'
import { NOMBRE_DE_MODULO, rutaPublica } from '../modulos'
import {
  claveDeFicha,
  leerTitulosDeFichas,
  type EstadoDeFicha,
  type ReferenciaDeFicha,
} from '../titulosDeFichas'

export const dynamic = 'force-dynamic'

/**
 * Cómo se nombra una ficha en las tablas de esta página.
 *
 * El número de fila solo aparece cuando no hay título que poner, y entonces va
 * con la razón delante —borrada, sin título, no se pudo leer— para que no
 * parezca un rótulo sino lo que es. Son los mismos cuatro casos que rotula
 * «Fichas más leídas» en estadísticas (`rotularFichasLeidas`), con la misma
 * redacción, para que una ficha no se llame de dos maneras según la pantalla.
 *
 * `eliminada` llega de fuera porque la tabla del simulador habla de casos y las
 * otras de fichas, y en español el participio concuerda.
 */
function rotuloDeFicha(estado: EstadoDeFicha, documentoId: string, eliminada: string): string {
  switch (estado.tipo) {
    case 'titulo':
      return estado.titulo
    case 'sinTitulo':
      return `Sin título · #${documentoId}`
    case 'eliminada':
      return `${eliminada} · #${documentoId}`
    case 'ilegible':
      return `Título no disponible · #${documentoId}`
  }
}

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
 * Actividad de lectura y recorridos del simulador.
 *
 * Responde a tres preguntas distintas y las presenta por separado, porque
 * mezclarlas no informa de nada: quién está usando la plataforma (una fila por
 * persona), qué se está leyendo (una fila por ficha) y dónde se atasca la gente
 * en pabellón (una fila por paso del guion). Las dos primeras dicen si el
 * material llega a alguien y qué contenido vale la pena ampliar; la tercera, qué
 * gesto hay que explicar mejor.
 *
 * No es vigilancia del residente: son visitas a fichas de estudio, sin tiempos
 * ni recorridos. Sirve para decidir dónde poner el esfuerzo de redacción. Y el
 * puntaje del simulador no es una nota —lo calcula el navegador y el servidor no
 * lo puede recalcular—, así que se enseña dicho en la propia pantalla.
 */
export default async function PaginaActividad() {
  await exigirPanel('admin')

  const payload = await clientePayload()

  // Las dos consultas van juntas y ninguna espera a la otra: la de abajo trae
  // la tabla para las tablas de lectura y `resumenDeActividad` cuenta los
  // recorridos del simulador, que es lo que sabe qué fila es un caso jugado.
  //
  // El `catch` de la tabla devuelve `null` y no una lista vacía. Devolvía
  // `{ docs: [], totalDocs: 0 }`, y con la tabla sin poder leerse —lo corriente:
  // un cambio de esquema desplegado sin su migración— la pantalla decía
  // «Todavía nadie ha abierto una ficha»: la misma confusión entre «no hay» y
  // «no se pudo leer» que los títulos de abajo arrastraban con «Ficha
  // eliminada», y que las tarjetas del resumen dejaron de cometer con
  // `ilegible`.
  const [listado, resumen] = await Promise.all([
    payload
      .find({
        collection: 'actividad',
        limit: 1000,
        sort: '-ultimaVisita',
        depth: 1,
        overrideAccess: true,
      })
      .catch((error) => {
        console.error('[panel] no se pudo leer la tabla de actividad:', error)
        return null
      }),
    resumenDeActividad(payload),
  ])
  const docs = listado?.docs ?? []
  const totalDocs = listado?.totalDocs ?? 0
  const simulador = resumen.simulador
  const atascos = simulador.atascos.slice(0, 20)

  const registros: Registro[] = (docs as unknown as Record<string, unknown>[]).map((d) => {
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
  const ultimas = registros.slice(0, 30)

  // Las dos tablas de fichas nombraban cada una con el identificador de fila de
  // la base —«#3», «#17», «#41»—, en la página cuyo único propósito es
  // responder qué se está leyendo: para saber cuál era la ficha más leída del
  // semestre había que abrirlas de una en una.
  //
  // Los títulos los busca `leerTitulosDeFichas`, la misma que usan
  // «Fichas más leídas» de estadísticas y la bandeja de comentarios. Aquí se
  // hacía con un `findByID` por ficha y un `catch` vacío, y ese `catch` era el
  // defecto: `findByID` lanza igual con la ficha borrada que con la base sin
  // responder, así que una tabla caída pintaba las cincuenta filas como «Ficha
  // eliminada» y mandaba a buscar en los respaldos algo que estaba en su sitio.
  // La función compartida separa las dos cosas, y de paso son cinco consultas
  // como mucho —una por colección— y no cincuenta.
  //
  // Un `documentoId` vacío no se pregunta: en el `id: { in: … }` de su colección
  // basta con que la base lo rechace para que falle la consulta entera y todo
  // ese módulo salga ilegible por culpa de una fila.
  const porResolver = new Map<string, ReferenciaDeFicha>()
  const pedir = (coleccion: string, documentoId: string) => {
    if (coleccion === '' || documentoId === '') return
    porResolver.set(claveDeFicha(coleccion, documentoId), { coleccion, documentoId })
  }
  for (const f of [...fichas, ...ultimas]) pedir(f.coleccion, f.documentoId)
  // Los casos donde alguien se atascó entran en el mismo barrido: casi siempre
  // ya están —un caso que se juega se visita—, y el mapa los deduplica solo. Sin
  // esto, la tabla de abajo nombraría la cirugía con el número de fila, que es
  // justo lo que esta pantalla dejó de hacer.
  for (const atasco of atascos) pedir('cirugias', atasco.documentoId)

  const estados = await leerTitulosDeFichas(payload, [...porResolver.values()])

  // Una ficha que no llegó a preguntarse no tiene estado. Llamarla «eliminada»
  // sería inventárselo; `ilegible` es lo único que no afirma nada sobre ella.
  // Es el mismo criterio que `estadoDeLaFicha` en `fichasMasLeidas.ts`.
  const estadoDe = (coleccion: string, documentoId: string): EstadoDeFicha =>
    estados.get(claveDeFicha(coleccion, documentoId)) ?? { tipo: 'ilegible' }

  const modulosIlegibles = Array.from(
    new Set(
      [...porResolver.values()]
        .filter((f) => estadoDe(f.coleccion, f.documentoId).tipo === 'ilegible')
        .map((f) => NOMBRE_DE_MODULO[f.coleccion] ?? f.coleccion),
    ),
  )

  return (
    <div>
      <header className="admin-header">
        <h1 className="admin-title">Actividad</h1>
        {/* Sin listado no hay recuento que dar: «0 registros» sería la misma
            respuesta falsa que el aviso de abajo existe para no dar. */}
        {listado ? (
          <p className="admin-subtitle">
            {totalDocs} registro{totalDocs === 1 ? '' : 's'} de lectura · {personas.length}{' '}
            persona
            {personas.length === 1 ? '' : 's'} han abierto alguna ficha
          </p>
        ) : null}
      </header>

      {modulosIlegibles.length > 0 ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudieron leer los títulos de {modulosIlegibles.join(', ')}.</strong> Esas
          fichas aparecen como «Título no disponible», y eso no significa que se hayan eliminado:
          la consulta falló. El detalle queda en el registro del servidor.
        </div>
      ) : null}

      {listado === null ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudo leer la tabla de actividad.</strong> Esto no significa que nadie haya
          abierto una ficha: la consulta falló. Lo corriente es que falte una tabla —un cambio de
          esquema desplegado sin su migración—; el detalle queda en el registro del servidor.
        </div>
      ) : registros.length === 0 ? (
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

          {/* ------------------------------------------------- simulador --
              La mitad visible de lo que la consola guarda. Sin ella, el puntaje
              y las complicaciones vuelven a ser tres columnas que se escriben y
              no lee nadie, que es de donde vienen. */}
          <h2 className="admin-section-title">Simulador quirúrgico</h2>

          {simulador.ilegible ? (
            <div className="admin-aviso admin-aviso-error">
              <strong>No se pudieron leer los recorridos.</strong>
              Aquí no hay un recuento, hay una consulta que falló: el fallo queda
              en el registro del servidor.
            </div>
          ) : simulador.casos === 0 ? (
            <p className="admin-subtitle">
              Todavía nadie ha recorrido un caso del simulador. El registro
              empieza en cuanto un residente supera el primer paso.
            </p>
          ) : (
            <>
              {/* Antes de la primera cifra, no debajo: quien mira una tabla de
                  números la interpreta mientras la lee, y el puntaje se parece
                  demasiado a una nota. La advertencia detrás llegaría tarde. */}
              <div className="admin-aviso admin-aviso-atencion">
                <strong>El puntaje no es una calificación.</strong>
                Lo calcula la consola en el navegador del residente y el servidor
                no puede recalcularlo sin repetir la simulación, así que un
                residente podría escribir el suyo. Sirve para ver quién ha
                recorrido qué y qué gesto se le atraviesa a la gente, no para
                evaluar a nadie.
              </div>

              <p className="admin-subtitle">
                {simulador.casos} caso{simulador.casos === 1 ? '' : 's'} recorrido
                {simulador.casos === 1 ? '' : 's'} ·{' '}
                {simulador.casosConComplicacion} con alguna complicación ·{' '}
                {simulador.complicaciones} gesto
                {simulador.complicaciones === 1 ? '' : 's'} que dañaron
              </p>

              {atascos.length === 0 ? (
                <p className="admin-subtitle">
                  Ningún paso ha dado complicaciones todavía.
                </p>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Caso</th>
                        <th>Paso</th>
                        <th>Qué pasó</th>
                        <th>Veces</th>
                        <th>Residentes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {atascos.map((atasco) => {
                        const clave = claveDeFicha('cirugias', atasco.documentoId)
                        const estado = estadoDe('cirugias', atasco.documentoId)
                        const rotulo = rotuloDeFicha(estado, atasco.documentoId, 'Caso eliminado')
                        return (
                          <tr key={`${clave}#${atasco.paso}`}>
                            <th scope="row" className="admin-table-user-name">
                              {estado.tipo === 'eliminada' ? (
                                rotulo
                              ) : (
                                <Link
                                  href={`/admin-panel/contenido/cirugias/${atasco.documentoId}`}
                                >
                                  {rotulo}
                                </Link>
                              )}
                            </th>
                            <td>
                              {/* El número y el título son la copia de cómo vio
                                  el paso quien lo jugó: el identificador deja de
                                  encontrar nada en cuanto el guion se reordena,
                                  y entonces esto es lo único que lo nombra. */}
                              {atasco.numero ? `${atasco.numero}. ` : ''}
                              {atasco.titulo ?? 'Paso sin título guardado'}
                            </td>
                            <td>
                              <div className="admin-acciones">
                                {atasco.desenlaces.length === 0 ? (
                                  <span className="admin-numero-tenue">Sin desenlace</span>
                                ) : (
                                  atasco.desenlaces.map((desenlace) => (
                                    <span
                                      key={desenlace}
                                      className="admin-badge admin-badge-borrador"
                                    >
                                      {NOMBRE_DEL_DESENLACE[desenlace]}
                                    </span>
                                  ))
                                )}
                              </div>
                            </td>
                            <td>{atasco.veces}</td>
                            <td>{atasco.residentes}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

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
                {fichas.map((f) => {
                  const clave = claveDeFicha(f.coleccion, f.documentoId)
                  const estado = estadoDe(f.coleccion, f.documentoId)
                  const rotulo = rotuloDeFicha(estado, f.documentoId, 'Ficha eliminada')
                  return (
                    <tr key={clave}>
                      <th scope="row" className="admin-table-user-name">
                        {rotulo}
                        {estado.tipo === 'titulo' ? (
                          <div className="admin-table-user-email">#{f.documentoId}</div>
                        ) : null}
                      </th>
                      <td>
                        <span className="admin-badge admin-badge-neutro">
                          {NOMBRE_DE_MODULO[f.coleccion] ?? f.coleccion}
                        </span>
                      </td>
                      <td>{f.lectores}</td>
                      <td>{f.completadas}</td>
                      <td>
                        {/* Solo se quita lo que se sabe que no lleva a nada: a
                            una ficha borrada los dos enlaces acababan en un
                            404, el del panel y el público. La que no se pudo
                            leer los conserva, porque lo probable es que siga
                            ahí y abrirla es la forma de comprobarlo. Y
                            «Editar» va primero y al editor porque es donde se
                            actúa sobre lo que se acaba de leer, y ese funciona
                            esté publicada o retirada; el botón de antes solo
                            servía si seguía publicada. */}
                        {estado.tipo !== 'eliminada' ? (
                          <div className="admin-acciones">
                            <Link
                              href={`/admin-panel/contenido/${f.coleccion}/${f.documentoId}`}
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                              aria-label={`Editar «${rotulo}»`}
                            >
                              Editar
                            </Link>
                            <Link
                              href={rutaPublica(f.coleccion, f.documentoId)}
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                              aria-label={`Ver «${rotulo}» en el sitio público`}
                            >
                              Ver
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
                {ultimas.map((r) => {
                  const estado = estadoDe(r.coleccion, r.documentoId)
                  const rotulo = rotuloDeFicha(estado, r.documentoId, 'Ficha eliminada')
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="admin-table-user-name">{r.usuarioNombre}</div>
                        <div className="admin-table-user-email">{r.usuarioCorreo}</div>
                      </td>
                      <td>
                        {estado.tipo === 'eliminada' ? (
                          <span className="admin-table-user-email">{rotulo}</span>
                        ) : (
                          <Link href={`/admin-panel/contenido/${r.coleccion}/${r.documentoId}`}>
                            {rotulo}
                          </Link>
                        )}
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
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
