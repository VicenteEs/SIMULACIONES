'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'

/**
 * Pestañas accesibles (E2, D-158).
 *
 * Nacen para partir en tres el panel derecho del taller anatómico, que era una
 * sola columna de once secciones. Siguen el patrón de pestañas de WAI-ARIA con
 * activación automática: `role="tablist"`, una sola pestaña en el orden del
 * Tab (la activa, `tabIndex` 0), las demás alcanzables con las flechas, y el
 * foco que acompaña a la selección. Inicio y Fin saltan a la primera y a la
 * última.
 *
 * Es **controlado**: quien la usa guarda cuál está activa. Se prefirió a un
 * estado interno porque el taller necesita cambiar de pestaña por su cuenta —al
 * abrir un comentario hay que llevar a quien lo pulsa a «Comentarios»— y porque
 * el contenido de cada panel depende de estados que ya viven en el taller.
 *
 * Solo se monta el panel activo (`PanelDePestana`): lo de las otras no está en
 * el documento. Los campos del taller son controlados desde el taller, así que
 * nada de lo escrito se pierde al cambiar.
 */

export interface DefinicionDePestana {
  id: string
  etiqueta: ReactNode
}

const idDeLaPestana = (base: string, id: string) => `${base}-pestana-${id}`
const idDelPanel = (base: string, id: string) => `${base}-panel-${id}`

export function Pestanas({
  base,
  etiqueta,
  pestanas,
  activa,
  alCambiar,
}: {
  /** Prefijo único de este grupo en la página: de él salen los `id` que enlazan pestaña y panel. */
  base: string
  /** Nombre del grupo para el lector de pantalla. */
  etiqueta: string
  pestanas: DefinicionDePestana[]
  activa: string
  alCambiar: (id: string) => void
}) {
  const lista = useRef<HTMLDivElement>(null)

  const alTeclear = (evento: KeyboardEvent<HTMLDivElement>) => {
    const i = pestanas.findIndex((p) => p.id === activa)
    let destino = -1
    if (evento.key === 'ArrowRight') destino = (i + 1) % pestanas.length
    else if (evento.key === 'ArrowLeft') destino = (i - 1 + pestanas.length) % pestanas.length
    else if (evento.key === 'Home') destino = 0
    else if (evento.key === 'End') destino = pestanas.length - 1
    if (destino < 0) return
    evento.preventDefault()
    alCambiar(pestanas[destino].id)
    // El foco acompaña a la selección. Se mueve en el siguiente cuadro, cuando
    // la pestaña nueva ya tiene `tabIndex` 0.
    requestAnimationFrame(() => {
      lista.current?.querySelector<HTMLElement>(`#${CSS.escape(idDeLaPestana(base, pestanas[destino].id))}`)?.focus()
    })
  }

  return (
    <div ref={lista} className="pestanas" role="tablist" aria-label={etiqueta} onKeyDown={alTeclear}>
      {pestanas.map((p) => {
        const seleccionada = p.id === activa
        return (
          <button
            key={p.id}
            id={idDeLaPestana(base, p.id)}
            type="button"
            role="tab"
            className={`pestana${seleccionada ? ' pestana-activa' : ''}`}
            aria-selected={seleccionada}
            aria-controls={idDelPanel(base, p.id)}
            tabIndex={seleccionada ? 0 : -1}
            onClick={() => alCambiar(p.id)}
          >
            {p.etiqueta}
          </button>
        )
      })}
    </div>
  )
}

/** El contenido de una pestaña. No pinta nada si no es la activa. */
export function PanelDePestana({
  base,
  id,
  activa,
  children,
}: {
  base: string
  id: string
  activa: string
  children: ReactNode
}) {
  if (id !== activa) return null
  return (
    <div
      id={idDelPanel(base, id)}
      role="tabpanel"
      aria-labelledby={idDeLaPestana(base, id)}
      className="pestana-panel"
    >
      {children}
    </div>
  )
}
