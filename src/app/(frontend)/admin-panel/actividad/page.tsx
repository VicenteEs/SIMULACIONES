import Link from 'next/link'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { NOMBRE_DEL_DESENLACE } from '@/lib/progresoDelSimulador'
import { clientePayload, resumenDeActividad } from '../datos'
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
  const [{ docs, totalDocs }, resumen] = await Promise.all([
    payload
      .find({
        collection: 'actividad',
        limit: 1000,
        sort: '-ultimaVisita',
        depth: 1,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as unknown[], totalDocs: 0 })),
    resumenDeActividad(payload),
  ])
  const simulador = resumen.simulador
  const atascos = simulador.atascos.slice(0, 20)

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
  const ultimas = registros.slice(0, 30)

  // Las dos tablas de fichas nombraban cada una con el identificador de fila de
  // la base —«#3», «#17», «#41»—, en la página cuyo único propósito es
  // responder qué se está leyendo: para saber cuál era la ficha más leída del
  // semestre había que abrirlas de una en una. Se resuelve el título como en la
  // portada y por la misma razón que allí se explica, que un número no le dice
  // nada a nadie.
  //
  // Son cincuenta como mucho y sin repetir —las veinte más leídas y las treinta
  // últimas visitas se solapan—, a profundidad 0 y en una página que ya es
  // `force-dynamic`. Cada consulta falla por su cuenta a propósito: el registro
  // de lectura sobrevive a la ficha que lo produjo, así que encontrar una
  // borrada es lo corriente aquí y no puede tumbar la página entera.
  const claveDeFicha = (coleccion: string, documentoId: string) => `${coleccion}/${documentoId}`

  const porResolver = new Map<string, { coleccion: string; documentoId: string }>()
  for (const f of [...fichas, ...ultimas]) {
    porResolver.set(claveDeFicha(f.coleccion, f.documentoId), {
      coleccion: f.coleccion,
      documentoId: f.documentoId,
    })
  }
  // Los casos donde alguien se atascó entran en el mismo barrido: casi siempre
  // ya están —un caso que se juega se visita—, y el mapa los deduplica solo. Sin
  // esto, la tabla de abajo nombraría la cirugía con el número de fila, que es
  // justo lo que esta pantalla dejó de hacer.
  for (const atasco of atascos) {
    porResolver.set(claveDeFicha('cirugias', atasco.documentoId), {
      coleccion: 'cirugias',
      documentoId: atasco.documentoId,
    })
  }

  const titulos = new Map<string, string>()
  await Promise.all(
    [...porResolver.values()].map(async ({ coleccion, documentoId }) => {
      try {
        // `titulo` en los casos AO y `nombre` en los otros cuatro módulos: son
        // los dos campos que `src/admin/esquema.ts` declara como nombre.
        const doc = (await payload.findByID({
          collection: coleccion as never,
          id: documentoId,
          depth: 0,
          overrideAccess: true,
        })) as Record<string, unknown> | null
        const nombre = doc?.nombre ?? doc?.titulo
        if (typeof nombre === 'string' && nombre.trim() !== '') {
          titulos.set(claveDeFicha(coleccion, documentoId), nombre)
        }
      } catch {
        // Borrada, o de una colección que ya no existe: la fila lo dirá.
      }
    }),
  )

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
                        const titulo = titulos.get(clave)
                        return (
                          <tr key={`${clave}#${atasco.paso}`}>
                            <th scope="row" className="admin-table-user-name">
                              {titulo ? (
                                <Link
                                  href={`/admin-panel/contenido/cirugias/${atasco.documentoId}`}
                                >
                                  {titulo}
                                </Link>
                              ) : (
                                `Caso eliminado · #${atasco.documentoId}`
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
                  const titulo = titulos.get(clave)
                  return (
                    <tr key={clave}>
                      <th scope="row" className="admin-table-user-name">
                        {titulo ?? `Ficha eliminada · #${f.documentoId}`}
                        {titulo ? (
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
                        {/* Sin título resuelto no hay nada que abrir: la ficha
                            ya no está y los dos enlaces acababan en un 404, el
                            del panel y el público. Y «Editar» va primero y al
                            editor porque es donde se actúa sobre lo que se
                            acaba de leer, y ese funciona esté publicada o
                            retirada; el botón de antes solo servía si seguía
                            publicada. */}
                        {titulo ? (
                          <div className="admin-acciones">
                            <Link
                              href={`/admin-panel/contenido/${f.coleccion}/${f.documentoId}`}
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                              aria-label={`Editar «${titulo}»`}
                            >
                              Editar
                            </Link>
                            <Link
                              href={rutaPublica(f.coleccion, f.documentoId)}
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                              aria-label={`Ver «${titulo}» en el sitio público`}
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
                  const titulo = titulos.get(claveDeFicha(r.coleccion, r.documentoId))
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="admin-table-user-name">{r.usuarioNombre}</div>
                        <div className="admin-table-user-email">{r.usuarioCorreo}</div>
                      </td>
                      <td>
                        {titulo ? (
                          <Link href={`/admin-panel/contenido/${r.coleccion}/${r.documentoId}`}>
                            {titulo}
                          </Link>
                        ) : (
                          <span className="admin-table-user-email">
                            Ficha eliminada · #{r.documentoId}
                          </span>
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
