'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { EsquemaDeColeccion } from '@/admin/esquema'
import {
  cambiarPublicacion,
  duplicarDocumento,
  eliminarDocumento,
  listarDocumentos,
  subirArchivo,
  type FilaDeLista,
} from '@/app/(frontend)/acciones/contenido'

/**
 * Listado de una colección.
 *
 * La búsqueda y el filtro se resuelven en el servidor, no en el navegador: una
 * biblioteca de fichas puede crecer a cientos y traerlas todas para filtrarlas
 * aquí funcionaría bien hasta el día en que dejara de funcionar.
 */

const fecha = (valor: unknown) =>
  typeof valor === 'string' && valor
    ? new Date(valor).toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

function celda(valor: unknown, formato?: string) {
  if (formato === 'fecha') return fecha(valor)
  if (formato === 'booleano') {
    return (
      <span className={`admin-badge ${valor === true ? 'admin-badge-publicado' : 'admin-badge-neutro'}`}>
        {valor === true ? 'Sí' : 'No'}
      </span>
    )
  }
  if (formato === 'estado') {
    const publicado = valor === 'published'
    return (
      <span className={`admin-badge ${publicado ? 'admin-badge-publicado' : 'admin-badge-borrador'}`}>
        {publicado ? '✓ Publicada' : '● Borrador'}
      </span>
    )
  }
  if (valor === null || valor === undefined || valor === '') return '—'
  return String(valor)
}

export function TablaDocumentos({ esquema }: { esquema: EsquemaDeColeccion }) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()

  const [filas, setFilas] = useState<FilaDeLista[]>([])
  const [total, setTotal] = useState(0)
  const [paginas, setPaginas] = useState(1)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<'todos' | 'publicado' | 'borrador'>('todos')
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const resultado = await listarDocumentos(esquema.slug, { pagina, busqueda, estado })
    if (resultado.exito && resultado.datos) {
      setFilas(resultado.datos.filas)
      setTotal(resultado.datos.total)
      setPaginas(resultado.datos.paginas)
    } else {
      setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo cargar el listado.' })
    }
    setCargando(false)
  }, [esquema.slug, pagina, busqueda, estado])

  // La búsqueda espera a que se deje de teclear: sin esto, escribir «fractura»
  // dispara ocho consultas y la última en llegar no tiene por qué ser la buena.
  useEffect(() => {
    const temporizador = setTimeout(() => void cargar(), busqueda ? 300 : 0)
    return () => clearTimeout(temporizador)
  }, [cargar, busqueda])

  const conAviso = (tarea: () => Promise<{ exito: boolean; mensaje?: string }>, exitoso: string) => {
    setAviso(null)
    iniciar(async () => {
      const r = await tarea()
      if (r.exito) {
        setAviso({ tipo: 'ok', texto: exitoso })
        void cargar()
        router.refresh()
      } else {
        setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo completar la acción.' })
      }
    })
  }

  return (
    <div>
      <div className="admin-toolbar">
        <div>
          <nav className="editor-migas">
            <Link href="/admin-panel/contenido">Contenido</Link>
          </nav>
          <h1 className="admin-title">{esquema.plural}</h1>
          <p className="admin-subtitle">
            {esquema.descripcion} · {total} en total
          </p>
        </div>
        <div className="admin-acciones">
          {esquema.subida ? (
            <SubidorDeArchivos esquema={esquema} alTerminar={() => void cargar()} />
          ) : (
            <Link
              href={`/admin-panel/contenido/${esquema.slug}/nuevo`}
              className="admin-btn admin-btn-primary"
            >
              + Nueva {esquema.singular.toLowerCase()}
            </Link>
          )}
        </div>
      </div>

      {aviso ? <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>{aviso.texto}</div> : null}

      <div className="admin-filters">
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="buscar-doc">
            Buscar
          </label>
          <input
            id="buscar-doc"
            className="admin-input"
            placeholder={`Buscar en ${esquema.plural.toLowerCase()}`}
            value={busqueda}
            onChange={(e) => {
              setPagina(1)
              setBusqueda(e.target.value)
            }}
          />
        </div>
        {esquema.versionada ? (
          <div className="admin-filter-group">
            <label className="admin-filter-label" htmlFor="filtro-doc-estado">
              Estado
            </label>
            <select
              id="filtro-doc-estado"
              className="admin-select"
              value={estado}
              onChange={(e) => {
                setPagina(1)
                setEstado(e.target.value as typeof estado)
              }}
            >
              <option value="todos">Todos</option>
              <option value="publicado">Publicadas</option>
              <option value="borrador">Borradores</option>
            </select>
          </div>
        ) : null}
        <span className="admin-filter-count">
          {cargando ? 'cargando…' : `${filas.length} en pantalla`}
        </span>
      </div>

      <div className="admin-table-container">
        {filas.length === 0 && !cargando ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">📄</div>
            <p className="admin-empty-text">
              {busqueda || estado !== 'todos'
                ? 'Nada coincide con el filtro.'
                : `Todavía no hay ${esquema.plural.toLowerCase()}.`}
            </p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                {esquema.columnas.map((c) => (
                  <th key={c.nombre}>{c.etiqueta}</th>
                ))}
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.id}>
                  {esquema.columnas.map((columna, i) => (
                    <td key={columna.nombre} className={i === 0 ? 'admin-table-user-name' : undefined}>
                      {i === 0 ? (
                        <Link href={`/admin-panel/contenido/${esquema.slug}/${fila.id}`}>
                          {celda(fila.valores[columna.nombre], columna.formato)}
                        </Link>
                      ) : (
                        celda(fila.valores[columna.nombre], columna.formato)
                      )}
                    </td>
                  ))}
                  <td>
                    <div className="admin-acciones">
                      <Link
                        href={`/admin-panel/contenido/${esquema.slug}/${fila.id}`}
                        className="admin-btn admin-btn-sm admin-btn-secondary"
                      >
                        Editar
                      </Link>
                      {esquema.versionada ? (
                        <button
                          className={`admin-btn admin-btn-sm ${fila.publicado ? 'admin-btn-secondary' : 'admin-btn-success'}`}
                          disabled={enCurso}
                          onClick={() =>
                            conAviso(
                              () => cambiarPublicacion(esquema.slug, fila.id, !fila.publicado),
                              fila.publicado ? 'Retirada de publicación.' : 'Publicada.',
                            )
                          }
                        >
                          {fila.publicado ? 'Retirar' : 'Publicar'}
                        </button>
                      ) : null}
                      {!esquema.subida ? (
                        <button
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          disabled={enCurso}
                          onClick={() =>
                            conAviso(
                              () => duplicarDocumento(esquema.slug, fila.id),
                              'Copia creada como borrador.',
                            )
                          }
                        >
                          Duplicar
                        </button>
                      ) : null}
                      <button
                        className="admin-btn admin-btn-sm admin-btn-danger"
                        disabled={enCurso}
                        onClick={() => {
                          if (confirm('¿Eliminar este registro? No se puede deshacer.')) {
                            conAviso(() => eliminarDocumento(esquema.slug, fila.id), 'Eliminado.')
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {paginas > 1 ? (
          <div className="admin-pie">
            <span>
              Página {pagina} de {paginas}
            </span>
            <div className="admin-acciones">
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={pagina <= 1}
                onClick={() => setPagina(pagina - 1)}
              >
                ← Anterior
              </button>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={pagina >= paginas}
                onClick={() => setPagina(pagina + 1)}
              >
                Siguiente →
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Subida directa para las colecciones de archivo (medios y modelos 3D). */
function SubidorDeArchivos({
  esquema,
  alTerminar,
}: {
  esquema: EsquemaDeColeccion
  alTerminar: () => void
}) {
  const [enCurso, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <label className="admin-btn admin-btn-primary">
        {enCurso ? 'Subiendo…' : '+ Subir archivo'}
        <input
          type="file"
          hidden
          accept={esquema.subida?.acepta}
          disabled={enCurso}
          multiple
          onChange={(e) => {
            const archivos = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (archivos.length === 0) return
            setError(null)
            iniciar(async () => {
              for (const archivo of archivos) {
                const formulario = new FormData()
                formulario.set('coleccion', esquema.slug)
                formulario.set('archivo', archivo)
                const nombre = archivo.name.replace(/\.[^.]+$/, '')
                formulario.set('alt', nombre)
                formulario.set('nombre', nombre)
                formulario.set('origen', 'tc')
                const r = await subirArchivo(formulario)
                if (!r.exito) {
                  setError(`${archivo.name}: ${r.mensaje ?? 'no se pudo subir'}`)
                  break
                }
              }
              alTerminar()
            })
          }}
        />
      </label>
      {error ? <p className="campo-error">{error}</p> : null}
    </div>
  )
}
