'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { EsquemaDeColeccion } from '@/admin/esquema'
import {
  cambiarPublicacion,
  duplicarDocumento,
  eliminarDocumento,
  guardarDocumento,
  opcionesDeRelacion,
} from '@/app/(frontend)/acciones/contenido'
import { FilaDeCampos, type Relaciones } from './formulario/Campos'

/**
 * Editor de un documento, sea de la colección que sea.
 *
 * Todo el documento vive en un solo objeto de estado y se envía entero al
 * guardar. Eso hace que agregar un campo al esquema no obligue a tocar nada
 * aquí, y que el borrador sea siempre coherente: no hay campos que se guarden
 * por su cuenta antes que el resto.
 *
 * Publicar y guardar son dos botones distintos a propósito (D-011): el
 * traumatólogo escribe a lo largo de varios días y nadie debe leer una ficha a
 * medio escribir por el hecho de haberla guardado.
 */

export function FormularioDocumento({
  esquema,
  documento,
  id,
  rutaPublica,
}: {
  esquema: EsquemaDeColeccion
  documento: Record<string, unknown>
  id: string | null
  rutaPublica: string | null
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()

  const [valores, setValores] = useState<Record<string, unknown>>(documento)
  const [seccion, setSeccion] = useState(0)
  const [relaciones, setRelaciones] = useState<Relaciones>({})
  const [sucio, setSucio] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const publicado = documento._status === 'published' || !esquema.versionada

  /** Colecciones a las que apunta algún campo del esquema o de los bloques. */
  const coleccionesRelacionadas = useMemo(
    () => ['segmentos', 'medios', 'modelos-3d', 'instancias-atlas'],
    [],
  )

  const cargarRelacion = useCallback(async (coleccion: string) => {
    const resultado = await opcionesDeRelacion(coleccion)
    if (resultado.exito && resultado.datos) {
      setRelaciones((previas) => ({ ...previas, [coleccion]: resultado.datos! }))
    }
  }, [])

  useEffect(() => {
    for (const coleccion of coleccionesRelacionadas) void cargarRelacion(coleccion)
  }, [coleccionesRelacionadas, cargarRelacion])

  // Avisa antes de cerrar la pestaña con cambios sin guardar. Perder media
  // hora de redacción por cerrar una pestaña es un fallo evitable.
  useEffect(() => {
    if (!sucio) return
    const alSalir = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [sucio])

  const cambiar = (nombre: string, valor: unknown) => {
    setValores((previos) => ({ ...previos, [nombre]: valor }))
    setSucio(true)
    setAviso(null)
  }

  /**
   * Primera sección con un campo obligatorio sin llenar.
   *
   * Sin esto, el aviso de «falta el segmento anatómico» aparece arriba
   * mientras el campo está en otra pestaña, y no hay forma de saber dónde
   * mirar. El servidor valida igual —esa es la barrera de verdad—; esto es
   * para que la persona encuentre el campo.
   */
  const seccionIncompleta = (): number =>
    esquema.secciones.findIndex((seccion) =>
      seccion.campos.some((campo) => {
        if (!campo.requerido) return false
        const valor = valores[campo.nombre]
        return (
          valor === null ||
          valor === undefined ||
          valor === '' ||
          (Array.isArray(valor) && valor.length === 0)
        )
      }),
    )

  const guardar = (publicar: boolean) => {
    setAviso(null)
    const incompleta = seccionIncompleta()
    if (incompleta >= 0) setSeccion(incompleta)
    iniciar(async () => {
      const resultado = await guardarDocumento(esquema.slug, id, valores, publicar)
      if (!resultado.exito || !resultado.datos) {
        const donde = seccionIncompleta()
        if (donde >= 0) setSeccion(donde)
        setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo guardar.' })
        return
      }
      setSucio(false)
      if (id === null) {
        router.replace(`/admin-panel/contenido/${esquema.slug}/${resultado.datos.id}`)
      } else {
        setAviso({
          tipo: 'ok',
          texto: publicar ? 'Publicado. Ya es visible para los lectores.' : 'Borrador guardado.',
        })
        router.refresh()
      }
    })
  }

  const titulo = String(valores[esquema.titulo] ?? '').trim()

  return (
    <div className="editor">
      <div className="admin-toolbar">
        <div>
          <nav className="editor-migas">
            <Link href="/admin-panel/contenido">Contenido</Link>
            <span>/</span>
            <Link href={`/admin-panel/contenido/${esquema.slug}`}>{esquema.plural}</Link>
          </nav>
          <h1 className="admin-title">{titulo || `${esquema.singular} sin título`}</h1>
          <p className="admin-subtitle">
            {id === null ? (
              'Sin guardar todavía'
            ) : esquema.versionada ? (
              <>
                <span
                  className={`admin-badge ${publicado ? 'admin-badge-publicado' : 'admin-badge-borrador'}`}
                >
                  {publicado ? '✓ Publicada' : '● Borrador'}
                </span>
                {sucio ? <span className="editor-sucio"> · cambios sin guardar</span> : null}
              </>
            ) : sucio ? (
              'Cambios sin guardar'
            ) : (
              'Guardado'
            )}
          </p>
        </div>

        <div className="admin-acciones">
          {rutaPublica && publicado ? (
            <Link href={rutaPublica} className="admin-btn admin-btn-secondary" target="_blank">
              Ver publicado ↗
            </Link>
          ) : null}

          {id !== null && !esquema.subida ? (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={enCurso}
              onClick={() =>
                iniciar(async () => {
                  const r = await duplicarDocumento(esquema.slug, id)
                  if (r.exito && r.datos) {
                    router.push(`/admin-panel/contenido/${esquema.slug}/${r.datos.id}`)
                  } else {
                    setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo duplicar.' })
                  }
                })
              }
            >
              Duplicar
            </button>
          ) : null}

          {esquema.versionada ? (
            <>
              <button
                className="admin-btn admin-btn-secondary"
                disabled={enCurso}
                onClick={() => guardar(false)}
              >
                {enCurso ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button
                className="admin-btn admin-btn-primary"
                disabled={enCurso}
                onClick={() => guardar(true)}
              >
                {publicado ? 'Guardar y publicar' : 'Publicar'}
              </button>
            </>
          ) : (
            <button
              className="admin-btn admin-btn-primary"
              disabled={enCurso}
              onClick={() => guardar(true)}
            >
              {enCurso ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
      </div>

      {aviso ? <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>{aviso.texto}</div> : null}

      {esquema.secciones.length > 1 ? (
        <nav className="editor-pestanas" aria-label="Secciones del documento">
          {esquema.secciones.map((s, i) => (
            <button
              key={s.titulo}
              type="button"
              className={`editor-pestana${i === seccion ? ' editor-pestana-activa' : ''}`}
              onClick={() => setSeccion(i)}
              aria-current={i === seccion ? 'true' : undefined}
            >
              {s.titulo}
              {faltaAlgo(esquema, valores, i) ? (
                <span className="editor-pestana-falta" title="Falta algo obligatorio">
                  !
                </span>
              ) : contarContenido(esquema, valores, i) > 0 ? (
                <span className="editor-pestana-marca" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </nav>
      ) : null}

      <section className="editor-seccion">
        {esquema.secciones[seccion]?.descripcion ? (
          <p className="editor-seccion-nota">{esquema.secciones[seccion].descripcion}</p>
        ) : null}
        <FilaDeCampos
          campos={esquema.secciones[seccion]?.campos ?? []}
          valores={valores}
          alCambiar={cambiar}
          relaciones={relaciones}
          alRecargarRelacion={(coleccion) => void cargarRelacion(coleccion)}
        />
      </section>

      {id !== null ? (
        <div className="editor-pie">
          {esquema.versionada && publicado ? (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={enCurso}
              onClick={() => {
                if (
                  confirm(
                    '¿Retirar de publicación?\n\nDeja de ser visible para los lectores, pero no se borra: vuelve a estado de borrador.',
                  )
                ) {
                  iniciar(async () => {
                    const r = await cambiarPublicacion(esquema.slug, id, false)
                    if (r.exito) router.refresh()
                    else setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo retirar.' })
                  })
                }
              }}
            >
              Retirar de publicación
            </button>
          ) : null}

          <button
            type="button"
            className="admin-btn admin-btn-danger"
            disabled={enCurso}
            onClick={() => {
              if (
                confirm(
                  `¿Eliminar «${titulo || esquema.singular}»?\n\nNo se puede deshacer. Si solo quiere que deje de verse, retírela de publicación.`,
                )
              ) {
                iniciar(async () => {
                  const r = await eliminarDocumento(esquema.slug, id)
                  if (r.exito) router.push(`/admin-panel/contenido/${esquema.slug}`)
                  else setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo eliminar.' })
                })
              }
            }}
          >
            Eliminar
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Cuántos campos de una sección tienen algo escrito, para marcar la pestaña. */
function contarContenido(
  esquema: EsquemaDeColeccion,
  valores: Record<string, unknown>,
  indice: number,
): number {
  const campos = esquema.secciones[indice]?.campos ?? []
  return campos.filter((campo) => {
    const valor = valores[campo.nombre]
    if (Array.isArray(valor)) return valor.length > 0
    if (typeof valor === 'string') return valor.trim().length > 0
    return valor !== null && valor !== undefined && valor !== false
  }).length
}

/** ¿Esta sección tiene algún campo obligatorio sin llenar? */
function faltaAlgo(
  esquema: EsquemaDeColeccion,
  valores: Record<string, unknown>,
  indice: number,
): boolean {
  return (esquema.secciones[indice]?.campos ?? []).some((campo) => {
    if (!campo.requerido) return false
    const valor = valores[campo.nombre]
    return (
      valor === null ||
      valor === undefined ||
      valor === '' ||
      (Array.isArray(valor) && valor.length === 0)
    )
  })
}
