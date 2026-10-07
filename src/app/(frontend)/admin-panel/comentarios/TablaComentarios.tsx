'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, CheckCheck, CircleDot, ExternalLink, MessageSquare, Pencil, RotateCcw, SearchX, Trash2 } from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { Vacio } from '@/components/ui/Vacio'
import { claseDeInsignia } from '@/lib/tonosDeEstado'
import {
  actualizarComentario,
  eliminarComentario,
  resolverTodosLosComentarios,
} from '@/app/(frontend)/acciones/admin'
import {
  MODULOS,
  NOMBRE_DE_DESTINO,
  SLUG_DEL_TALLER,
  rutaDelPanelParaComentario,
  rutaPublica,
} from '../modulos'
// Solo el tipo: `titulosDeFichas.ts` importa los esquemas del panel, y un
// `import` de valor los metería enteros en el paquete del navegador.
import type { EstadoDeFicha } from '../titulosDeFichas'

export interface ComentarioDelPanel {
  id: string
  texto: string
  estado: 'pendiente' | 'resuelto'
  coleccion: string
  documentoId: string
  creado: string
  autorNombre: string | null
  autorCorreo: string | null
  /**
   * Título de la ficha comentada, si el servidor pudo resolverlo.
   *
   * `documentoId` es un campo de texto suelto en `Comentarios`, no una
   * relación, así que la profundidad con la que se lee el comentario trae al
   * autor pero nunca el documento: hay que ir a buscarlo aparte. `null` cuando
   * no hay título, sea cual sea el motivo; el motivo lo dice `fichaEstado`.
   *
   * Obligatorio y no opcional: estuvo declarado con `?`, pintado y usado en
   * los `aria-label`, y ninguna página lo rellenaba. Un prop opcional que no
   * llega compila igual, que es justo lo que lo dejó muerto.
   */
  fichaTitulo: string | null
  /**
   * Por qué la ficha tiene o no tiene título, tal como lo contestó
   * `leerTitulosDeFichas`.
   *
   * Sin él, una ficha borrada y una que no se pudo leer se pintaban igual —el
   * nombre del módulo y los dos enlaces—, y en la borrada los dos acababan en un
   * 404. El aviso de encima de la tabla decía qué módulo había fallado, pero no
   * qué filas concretas eran de fichas que ya no existen.
   *
   * `null` cuando no se llegó a preguntar: el comentario apunta a una colección
   * que ya no es un módulo, o no guarda número de ficha.
   */
  fichaEstado: EstadoDeFicha['tipo'] | null
}

/**
 * Cómo se nombra la ficha cuando no hay título que poner.
 *
 * La misma redacción que `rotuloDeFicha` en `actividad/page.tsx` y que «Fichas
 * más leídas» de estadísticas, para que una ficha no se llame de dos maneras
 * según la pantalla. No se importa de allí porque aquella vive en una página de
 * servidor y esta tabla corre en el navegador. El número de fila va con la razón
 * delante para que no parezca un rótulo sino lo que es.
 */
function rotuloSinTitulo(c: ComentarioDelPanel): string | null {
  switch (c.fichaEstado) {
    case 'sinTitulo':
      return `Sin título · #${c.documentoId}`
    case 'eliminada':
      return `Ficha eliminada · #${c.documentoId}`
    case 'ilegible':
      return `Título no disponible · #${c.documentoId}`
    default:
      return null
  }
}

const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export function TablaComentarios({
  comentarios,
  puedeEliminar,
}: {
  comentarios: ComentarioDelPanel[]
  puedeEliminar: boolean
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  // Solo el error se queda además en la página: el resultado bueno sale como
  // aviso flotante, que se ve aunque se haya bajado hasta la fila doscientos
  // —el recuadro de antes estaba arriba del todo, fuera de la vista—, pero un
  // error con su motivo tiene que poder releerse después de que el aviso se
  // cierre.
  const [error, setError] = useState<string | null>(null)

  const [estado, setEstado] = useState<'todos' | 'pendiente' | 'resuelto'>('pendiente')
  const [modulo, setModulo] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return comentarios.filter((c) => {
      if (estado !== 'todos' && c.estado !== estado) return false
      if (modulo !== 'todos' && c.coleccion !== modulo) return false
      if (!texto) return true
      // El título de la ficha se busca igual que el texto y el autor. El filtro
      // de módulo reduce once colecciones a una, pero dentro de «Biblioteca de
      // patologías» siguen cayendo veinte comentarios y lo que se quiere buscar
      // es la ficha: «qué se dijo de la fractura de Colles». `join` convierte
      // nulo y `undefined` en cadena vacía, así que un comentario cuyo título no
      // se pudo resolver no aporta nada al texto contra el que se compara.
      //
      // El rótulo sin título entra también, porque es lo que se lee en la
      // columna: buscar «eliminada» junta los comentarios que se quedaron
      // hablando de una ficha que ya no existe, que son los que se pueden cerrar.
      return [c.texto, c.autorNombre, c.autorCorreo, c.fichaTitulo, rotuloSinTitulo(c)]
        .join(' ')
        .toLowerCase()
        .includes(texto)
    })
  }, [comentarios, estado, modulo, busqueda])

  const pendientes = comentarios.filter((c) => c.estado === 'pendiente').length

  const ejecutar = (
    tarea: () => Promise<{ exito: boolean; mensaje?: string }>,
    exitoso: string,
  ) => {
    setError(null)
    iniciar(async () => {
      const resultado = await tarea()
      if (resultado.exito) {
        avisar('ok', exitoso)
        router.refresh()
      } else {
        const texto = resultado.mensaje ?? 'No se pudo completar la acción.'
        setError(texto)
        avisar('error', texto)
      }
    })
  }

  return (
    <div>
      <CabeceraDePagina
        titulo="Comentarios y sugerencias"
        subtitulo={
          pendientes === 0
            ? 'No queda nada pendiente por revisar.'
            : `${pendientes} sin resolver de ${comentarios.length} en total.`
        }
        acciones={
          pendientes > 0 ? (
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled={enCurso}
              onClick={async () => {
                const si = await confirmar({
                  titulo: `¿Resolver los ${pendientes} comentarios pendientes?`,
                  mensaje: 'Pasan todos a «Resuelto». Se pueden reabrir uno a uno después.',
                  confirmar: `Resolver ${pendientes}`,
                })
                if (si) ejecutar(resolverTodosLosComentarios, 'Se resolvieron todos los pendientes.')
              }}
            >
              <CheckCheck aria-hidden size={16} />
              Resolver todos
            </button>
          ) : null
        }
      />

      {error ? (
        <div className="admin-aviso admin-aviso-error" role="status">
          {error}
        </div>
      ) : null}

      <div className="admin-filters">
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="buscar-comentario">
            Buscar
          </label>
          <input
            id="buscar-comentario"
            className="admin-input"
            placeholder="Texto o autor"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="filtro-estado-comentario">
            Estado
          </label>
          <select
            id="filtro-estado-comentario"
            className="admin-select"
            value={estado}
            onChange={(e) => setEstado(e.target.value as typeof estado)}
          >
            <option value="pendiente">Solo pendientes</option>
            <option value="resuelto">Solo resueltos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="filtro-modulo">
            Módulo
          </label>
          <select
            id="filtro-modulo"
            className="admin-select"
            value={modulo}
            onChange={(e) => setModulo(e.target.value)}
          >
            <option value="todos">Todos los módulos</option>
            {MODULOS.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.nombre}
              </option>
            ))}
            <option value={SLUG_DEL_TALLER}>{NOMBRE_DE_DESTINO[SLUG_DEL_TALLER]}</option>
          </select>
        </div>
        <span className="admin-filter-count">
          {visibles.length} de {comentarios.length}
        </span>
      </div>

      {visibles.length === 0 ? (
        comentarios.length === 0 ? (
          <Vacio icono={MessageSquare} titulo="Todavía nadie ha dejado comentarios en las fichas.">
            Cuando alguien comente una ficha desde la plataforma, aparecerá aquí.
          </Vacio>
        ) : (
          <Vacio
            icono={SearchX}
            titulo="Ningún comentario coincide con el filtro."
            accion={
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => {
                  setEstado('todos')
                  setModulo('todos')
                  setBusqueda('')
                }}
              >
                Ver todos
              </button>
            }
          />
        )
      ) : (
      <div className="admin-table-container">
          <table className="admin-table tabla-apilable">
            <thead>
              <tr>
                <th>Autor</th>
                <th>Comentario</th>
                <th>Ficha</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.id}>
                  <th scope="row">
                    <div className="admin-table-user-name">{c.autorNombre ?? 'Usuario'}</div>
                    <div className="admin-table-user-email">{c.autorCorreo ?? 'sin correo'}</div>
                  </th>
                  <td className="comentario-celda">
                    <div className="comentario-texto">{c.texto}</div>
                  </td>
                  <td data-etiqueta="Ficha">
                    {c.fichaEstado === 'titulo' && c.fichaTitulo ? (
                      <div className="admin-table-user-name">{c.fichaTitulo}</div>
                    ) : c.fichaEstado !== null ? (
                      <div className="admin-table-user-email">{rotuloSinTitulo(c)}</div>
                    ) : null}
                    <div className="admin-table-modulo">
                      {NOMBRE_DE_DESTINO[c.coleccion] ?? c.coleccion}
                    </div>
                    {/* «Editar» primero, y al editor del panel, porque es lo
                        que se va a hacer con un comentario que dice que falta
                        algo. El único enlace que había llevaba a la ficha
                        pública: desde ahí, corregirla costaba volver a Panel,
                        Contenido, el módulo, buscar la ficha por nombre y
                        Editar, con el identificador en pantalla todo el rato.

                        Solo se quitan donde se sabe que no llevan a nada: la
                        ficha `eliminada`, y la que no se llegó a preguntar
                        (`null`) porque su colección ya no es un módulo o no
                        guarda número. La `ilegible` los conserva, igual que en
                        actividad: lo probable es que siga ahí, y abrirla es la
                        forma de comprobarlo. */}
                    {c.coleccion === SLUG_DEL_TALLER ? (
                      // Una preparación del taller se atiende en el taller: el
                      // enlace la abre y señala este comentario (E2, D-158).
                      c.fichaEstado === 'eliminada' ? null : (
                        <div className="admin-acciones">
                          <Link
                            href={rutaDelPanelParaComentario(c.coleccion, c.documentoId, c.id)}
                            className="comentario-enlace"
                            aria-label={
                              c.fichaTitulo
                                ? `Abrir «${c.fichaTitulo}» en el taller anatómico`
                                : 'Abrir la preparación comentada en el taller anatómico'
                            }
                          >
                            <ExternalLink aria-hidden size={13} />
                            Abrir en el taller
                          </Link>
                        </div>
                      )
                    ) : c.fichaEstado === 'eliminada' || c.fichaEstado === null ? null : (
                      <div className="admin-acciones">
                        <Link
                          href={`/admin-panel/contenido/${c.coleccion}/${c.documentoId}`}
                          className="comentario-enlace"
                          aria-label={
                            c.fichaTitulo ? `Editar «${c.fichaTitulo}»` : 'Editar la ficha comentada'
                          }
                        >
                          <Pencil aria-hidden size={13} />
                          Editar
                        </Link>
                        <Link
                          href={rutaPublica(c.coleccion, c.documentoId)}
                          className="comentario-enlace"
                          aria-label={
                            c.fichaTitulo
                              ? `Ver «${c.fichaTitulo}» en el sitio público`
                              : 'Ver la ficha comentada en el sitio público'
                          }
                        >
                          <ExternalLink aria-hidden size={13} />
                          Ver ficha
                        </Link>
                      </div>
                    )}
                  </td>
                  <td data-etiqueta="Fecha" className="u-nowrap admin-celda-tenue">
                    {fechaHora(c.creado)}
                  </td>
                  <td data-etiqueta="Estado">
                    {/* El icono va con la palabra, no en su lugar: el estado no
                        se dice solo con color. */}
                    <span className={claseDeInsignia(c.estado === 'pendiente' ? 'atencion' : 'ok')}>
                      {c.estado === 'pendiente' ? (
                        <CircleDot aria-hidden size={12} />
                      ) : (
                        <Check aria-hidden size={12} />
                      )}
                      {c.estado === 'pendiente' ? 'Pendiente' : 'Resuelto'}
                    </span>
                  </td>
                  <td className="admin-table-acciones">
                    <div className="admin-table-acciones-fila">
                      <button
                        type="button"
                        className={`admin-btn admin-btn-sm ${c.estado === 'pendiente' ? 'admin-btn-success' : 'admin-btn-secondary'}`}
                        disabled={enCurso}
                        onClick={() =>
                          ejecutar(
                            () =>
                              actualizarComentario(
                                c.id,
                                c.estado === 'pendiente' ? 'resuelto' : 'pendiente',
                              ),
                            c.estado === 'pendiente'
                              ? 'Comentario marcado como resuelto.'
                              : 'Comentario reabierto.',
                          )
                        }
                      >
                        {c.estado === 'pendiente' ? (
                          <Check aria-hidden size={14} />
                        ) : (
                          <RotateCcw aria-hidden size={14} />
                        )}
                        {c.estado === 'pendiente' ? 'Resolver' : 'Reabrir'}
                      </button>
                      {puedeEliminar ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon"
                          disabled={enCurso}
                          aria-label={`Eliminar el comentario de ${c.autorNombre ?? 'Usuario'}`}
                          title="Eliminar"
                          onClick={async () => {
                            const si = await confirmar({
                              titulo: '¿Eliminar este comentario?',
                              mensaje: 'Se borra la observación de otra persona y no se puede deshacer.',
                              confirmar: 'Eliminar comentario',
                              peligro: true,
                            })
                            if (si) ejecutar(() => eliminarComentario(c.id), 'Comentario eliminado.')
                          }}
                        >
                          <Trash2 aria-hidden size={16} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
      )}
    </div>
  )
}
