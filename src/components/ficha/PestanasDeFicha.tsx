'use client'

import React, { useEffect, useRef, useState, type ReactNode } from 'react'
import { anotarSeccion } from '@/app/(frontend)/acciones/actividad'

export interface PanelDeFicha {
  campo: string
  etiqueta: string
  /** Su lugar entre las seis pestañas fijas, desde uno: es lo que se anota (`dondeSeQuedo.ts`). */
  numero: number
  contenido: ReactNode
}

/**
 * Las pestañas de la ficha de patología, como en el tablero de Penpot (P-007
 * E4, D-237). Reemplazan al índice lateral (`IndiceFicha`), que con la ficha
 * entera en una sola columna larga servía para saltar; con pestañas, cada
 * sección se lee sola y la columna de al lado queda para los datos y para lo
 * que sigue.
 *
 * Todo el contenido llega ya pintado por el servidor y aquí solo se decide cuál
 * se ve. Las otras siguen en la página con `hidden`, y eso es lo que permite
 * que «Guardar PDF» imprima la ficha entera: la hoja de impresión las enseña
 * todas (`estilos.css`).
 *
 * La pestaña elegida va al ancla de la dirección (`#clasificacion`), así que
 * se puede enlazar, sobrevive a recargar y «Continúa leyendo» abre en ella. Y
 * se anota en `actividad` cuando el residente la cambia, no al abrir la ficha:
 * al abrir, la visita ya la anota `RastreadorActividad`, y dos escrituras de la
 * misma fila a la vez solo se pisarían.
 *
 * Pestañas de verdad (`tablist`, `tab`, `tabpanel`) con su teclado: una sola
 * parada de tabulador en la tira, las flechas para moverse y Inicio y Fin.
 */
export function PestanasDeFicha({
  coleccion,
  documentoId,
  paneles,
  lateral,
}: {
  coleccion: string
  documentoId: string
  paneles: PanelDeFicha[]
  lateral: ReactNode
}) {
  const [activa, setActiva] = useState(paneles[0]?.campo ?? '')
  const botones = useRef<Record<string, HTMLButtonElement | null>>({})

  // El ancla manda al llegar y cuando cambia sin recargar: un enlace dentro de
  // la propia ficha a `#manejo`, o el botón «atrás» del navegador.
  useEffect(() => {
    const leerAncla = () => {
      const campo = decodeURIComponent(window.location.hash.slice(1))
      if (paneles.some((p) => p.campo === campo)) setActiva(campo)
    }
    leerAncla()
    window.addEventListener('hashchange', leerAncla)
    return () => window.removeEventListener('hashchange', leerAncla)
  }, [paneles])

  function elegir(campo: string, conFoco = false) {
    if (campo === activa) return
    setActiva(campo)
    // `replaceState` y no `location.hash`: este último salta al ancla y empuja
    // una entrada al historial por cada pestaña, y «atrás» se volvería un
    // recorrido por las pestañas en vez de volver a la biblioteca.
    window.history.replaceState(null, '', `#${campo}`)
    if (conFoco) botones.current[campo]?.focus()
    const panel = paneles.find((p) => p.campo === campo)
    if (panel) anotarSeccion(coleccion, documentoId, panel.numero)
  }

  const alPulsarTecla = (e: React.KeyboardEvent) => {
    const i = paneles.findIndex((p) => p.campo === activa)
    const paso = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const destino =
      e.key === 'Home' ? paneles[0] : e.key === 'End' ? paneles[paneles.length - 1] : paso ? paneles[(i + paso + paneles.length) % paneles.length] : null
    if (!destino) return
    e.preventDefault()
    elegir(destino.campo, true)
  }

  return (
    <>
      {paneles.length > 1 ? (
        <div className="ficha-pestanas" role="tablist" aria-label="Secciones de la ficha" onKeyDown={alPulsarTecla}>
          {paneles.map((p) => (
            <button
              key={p.campo}
              ref={(nodo) => {
                botones.current[p.campo] = nodo
              }}
              id={`pestana-${p.campo}`}
              type="button"
              role="tab"
              aria-selected={p.campo === activa}
              aria-controls={p.campo}
              tabIndex={p.campo === activa ? 0 : -1}
              onClick={() => elegir(p.campo)}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ficha-cuerpo">
        <div className="ficha-contenido">
          {paneles.map((p) => (
            <section
              key={p.campo}
              id={p.campo}
              className="ficha-seccion"
              role={paneles.length > 1 ? 'tabpanel' : undefined}
              aria-labelledby={paneles.length > 1 ? `pestana-${p.campo}` : undefined}
              hidden={p.campo !== activa}
            >
              <h2>{p.etiqueta}</h2>
              {p.contenido}
            </section>
          ))}
        </div>
        {lateral}
      </div>
    </>
  )
}
