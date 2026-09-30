'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { notasDeLaFicha } from '@/app/(frontend)/acciones/revision'
import type { NotasDeLaFicha } from '@/lib/revisionServidor'

/**
 * Las notas del modelo para quien revisa, en la barra lateral (D-144).
 *
 * El modelo que redactó la ficha deja dicho lo que la fuente no cubre, las
 * cifras dudosas con su página y las figuras que convendría sustituir. Son lo
 * primero que el revisor necesita y no pueden esconderse en una pestaña del
 * editor: están a la vista **siempre que haya una ficha abierta**, en cualquier
 * pestaña, y desaparecen al salir de ella.
 *
 * Vive en la barra y no en la página porque la barra dura lo que dura el panel:
 * se lee la ruta y se piden las notas de la ficha que esa ruta nombra. Solo las
 * rutas de una ficha existente (`/admin-panel/contenido/<módulo>/<id>`) las
 * piden; «nuevo» y los listados no tienen nada que enseñar.
 *
 * Una petición vieja no puede pisar a una nueva: si se navega de una ficha a
 * otra antes de que conteste la primera, su respuesta se descarta.
 */
const RUTA_DE_FICHA = /^\/admin-panel\/contenido\/([a-z0-9-]+)\/(\d+)\/?$/

export function NotasDelRevisorEnLaBarra() {
  const ruta = usePathname() ?? ''
  const coincide = RUTA_DE_FICHA.exec(ruta)
  const coleccion = coincide?.[1] ?? null
  const id = coincide?.[2] ?? null
  const [notas, setNotas] = useState<{ clave: string; datos: NotasDeLaFicha | null } | null>(null)
  const [plegada, setPlegada] = useState(false)

  useEffect(() => {
    if (!coleccion || !id) return
    let vigente = true
    notasDeLaFicha(coleccion, id)
      .then((r) => {
        if (vigente) setNotas({ clave: `${coleccion}/${id}`, datos: r.exito ? (r.datos ?? null) : null })
      })
      .catch(() => {
        if (vigente) setNotas({ clave: `${coleccion}/${id}`, datos: null })
      })
    return () => {
      vigente = false
    }
  }, [coleccion, id])

  // Lo de otra ficha no se enseña mientras llega lo de esta.
  if (!coleccion || !id || !notas || notas.clave !== `${coleccion}/${id}` || !notas.datos) return null
  const { datos } = notas
  const fuente = [datos.libro, datos.capitulo && `cap. ${datos.capitulo}`, datos.paginas && `págs. ${datos.paginas}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="admin-notas-revisor" aria-label="Notas para el revisor">
      <button
        type="button"
        className="admin-notas-titulo"
        onClick={() => setPlegada((p) => !p)}
        aria-expanded={!plegada}
      >
        <span>Notas para el revisor</span>
        <span className="admin-notas-cuenta">{datos.notas.length}</span>
      </button>
      {!plegada ? (
        <div className="admin-notas-cuerpo">
          {fuente ? <p className="admin-notas-fuente">{fuente}</p> : null}
          {datos.notas.length === 0 ? (
            <p className="admin-notas-vacio">El modelo no dejó notas para esta ficha.</p>
          ) : (
            <ol className="admin-notas-lista">
              {datos.notas.map((nota, i) => (
                <li key={i}>{nota}</li>
              ))}
            </ol>
          )}
          {datos.archivoFuente ? <p className="admin-notas-fuente">Archivo: {datos.archivoFuente}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
