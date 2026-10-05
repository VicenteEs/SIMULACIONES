import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

/**
 * Estado vacío: un icono, una frase y, si se puede hacer algo, la acción.
 *
 * Antes era una tarjeta con un párrafo, o un emoji escondido con
 * `display: none` (seis marcadores muertos en el panel). Un vacío sin acción
 * deja a quien llega sin saber si falta algo o si es así.
 */
export function Vacio({
  icono: Icono = Inbox,
  titulo,
  children,
  accion,
  compacto,
}: {
  icono?: LucideIcon
  titulo: ReactNode
  children?: ReactNode
  accion?: ReactNode
  compacto?: boolean
}) {
  return (
    <div className={`vacio${compacto ? ' vacio-compacto' : ''}`}>
      <span className="vacio-icono" aria-hidden>
        <Icono size={compacto ? 22 : 28} strokeWidth={1.6} />
      </span>
      <p className="vacio-titulo">{titulo}</p>
      {children ? <div className="vacio-texto">{children}</div> : null}
      {accion ? <div className="vacio-accion">{accion}</div> : null}
    </div>
  )
}
