'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  actualizarComentario,
  eliminarComentario,
  resolverTodosLosComentarios,
} from '@/app/(frontend)/acciones/admin'
import { MODULOS, NOMBRE_DE_MODULO, rutaPublica } from '../modulos'

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
   * autor pero nunca el documento: hay que ir a buscarlo aparte. Es opcional
   * porque la ficha pudo borrarse y el comentario seguir ahí; sin él la fila
   * cae al nombre del módulo, que es lo único seguro.
   */
  fichaTitulo?: string | null
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
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

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
      return [c.texto, c.autorNombre, c.autorCorreo, c.fichaTitulo]
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
    setAviso(null)
    iniciar(async () => {
      const resultado = await tarea()
      if (resultado.exito) {
        setAviso({ tipo: 'ok', texto: exitoso })
        router.refresh()
      } else {
        setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo completar la acción.' })
      }
    })
  }

  return (
    <div>
      <div className="admin-toolbar">
        <div>
          <h1 className="admin-title">Comentarios y sugerencias</h1>
          <p className="admin-subtitle">
            {pendientes === 0
              ? 'No queda nada pendiente por revisar.'
              : `${pendientes} sin resolver de ${comentarios.length} en total.`}
          </p>
        </div>
        {pendientes > 0 ? (
          <div className="admin-acciones">
            <button
              className="admin-btn admin-btn-secondary"
              disabled={enCurso}
              onClick={() => {
                if (confirm(`¿Marcar como resueltos los ${pendientes} comentarios pendientes?`)) {
                  ejecutar(resolverTodosLosComentarios, 'Se resolvieron todos los pendientes.')
                }
              }}
            >
              Resolver todos
            </button>
          </div>
        ) : null}
      </div>

      {aviso ? <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>{aviso.texto}</div> : null}

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
          </select>
        </div>
        <span className="admin-filter-count">
          {visibles.length} de {comentarios.length}
        </span>
      </div>

      <div className="admin-table-container">
        {visibles.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">💬</div>
            <p className="admin-empty-text">
              {comentarios.length === 0
                ? 'Todavía nadie ha dejado comentarios en las fichas.'
                : 'Ningún comentario coincide con el filtro.'}
            </p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Autor</th>
                <th>Comentario</th>
                <th>Ficha</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="admin-table-user-name">{c.autorNombre ?? 'Usuario'}</div>
                    <div className="admin-table-user-email">{c.autorCorreo ?? 'sin correo'}</div>
                  </td>
                  <td style={{ maxWidth: 420 }}>
                    <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {c.texto}
                    </div>
                  </td>
                  <td>
                    {c.fichaTitulo ? (
                      <div className="admin-table-user-name">{c.fichaTitulo}</div>
                    ) : null}
                    <div className="admin-table-modulo">
                      {NOMBRE_DE_MODULO[c.coleccion] ?? c.coleccion}
                    </div>
                    {/* «Editar» primero, y al editor del panel, porque es lo
                        que se va a hacer con un comentario que dice que falta
                        algo. El único enlace que había llevaba a la ficha
                        pública: desde ahí, corregirla costaba volver a Panel,
                        Contenido, el módulo, buscar la ficha por nombre y
                        Editar, con el identificador en pantalla todo el rato. */}
                    <div className="admin-acciones">
                      <Link
                        href={`/admin-panel/contenido/${c.coleccion}/${c.documentoId}`}
                        className="admin-table-user-email"
                        aria-label={
                          c.fichaTitulo ? `Editar «${c.fichaTitulo}»` : 'Editar la ficha comentada'
                        }
                      >
                        editar →
                      </Link>
                      <Link
                        href={rutaPublica(c.coleccion, c.documentoId)}
                        className="admin-table-user-email"
                        aria-label={
                          c.fichaTitulo
                            ? `Ver «${c.fichaTitulo}» en el sitio público`
                            : 'Ver la ficha comentada en el sitio público'
                        }
                      >
                        ver ficha →
                      </Link>
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                    {fechaHora(c.creado)}
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${c.estado === 'pendiente' ? 'admin-badge-pending' : 'admin-badge-resolved'}`}
                    >
                      {c.estado === 'pendiente' ? '● Pendiente' : '✓ Resuelto'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-acciones">
                      <button
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
                        {c.estado === 'pendiente' ? 'Resolver' : 'Reabrir'}
                      </button>
                      {puedeEliminar ? (
                        <button
                          className="admin-btn admin-btn-sm admin-btn-danger"
                          disabled={enCurso}
                          onClick={() => {
                            if (confirm('¿Eliminar este comentario? No se puede deshacer.')) {
                              ejecutar(() => eliminarComentario(c.id), 'Comentario eliminado.')
                            }
                          }}
                        >
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
