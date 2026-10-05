'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * El menú «⋯» de una fila o de una barra.
 *
 * Las tablas de Documentos y de Usuarios llevaban cuatro y cinco botones por
 * fila: en un portátil la columna de acciones se comía media tabla, y en el
 * móvil obligaba a desplazar de lado. Lo frecuente se queda fuera como botón;
 * lo demás entra aquí.
 *
 * Patrón de menú de botones: Escape cierra y devuelve el foco al disparador,
 * las flechas recorren las opciones, el clic fuera cierra.
 */
export type OpcionDeMenu = {
  etiqueta: string
  icono?: LucideIcon
  alElegir: () => void
  peligro?: boolean
  desactivada?: boolean
}

export function MenuAcciones({
  opciones,
  etiqueta = 'Más acciones',
  children,
}: {
  opciones: OpcionDeMenu[]
  /** Nombre accesible del botón «⋯». */
  etiqueta?: string
  /** Para usar otro disparador visible que el «⋯». */
  children?: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false)
        boton.current?.focus()
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const items = Array.from(raiz.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? [])
        const i = items.indexOf(document.activeElement as HTMLButtonElement)
        const siguiente = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
        items[siguiente]?.focus()
      }
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    raiz.current?.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus()
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div className="menu-acciones" ref={raiz}>
      <button
        ref={boton}
        type="button"
        className="menu-acciones-boton"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={children ? undefined : etiqueta}
        title={children ? undefined : etiqueta}
        onClick={() => setAbierto((a) => !a)}
      >
        {children ?? <MoreHorizontal aria-hidden size={18} />}
      </button>
      {abierto ? (
        <div className="menu-acciones-lista" role="menu" id={id}>
          {opciones.map((o) => {
            const Icono = o.icono
            return (
              <button
                key={o.etiqueta}
                type="button"
                role="menuitem"
                className={`menu-acciones-opcion${o.peligro ? ' menu-acciones-peligro' : ''}`}
                disabled={o.desactivada}
                onClick={() => {
                  setAbierto(false)
                  o.alElegir()
                }}
              >
                {Icono ? <Icono aria-hidden size={16} /> : null}
                {o.etiqueta}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
