import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * La cabecera de cada pantalla del panel: migas, título, subtítulo y, a la
 * derecha, las acciones de la página.
 *
 * Cada pantalla la escribía a mano —`admin-header`, `admin-toolbar` o un
 * `div` suelto— con el título a 28 px en unas y a 22 en otras, y los botones
 * principales unas veces arriba a la derecha y otras debajo del subtítulo.
 * Con una sola pieza, la acción principal siempre está en el mismo sitio.
 *
 * Las clases `admin-header`, `admin-title` y `admin-subtitle` se conservan
 * porque las usan también `error.tsx` y `not-found.tsx`, que no pasan por aquí.
 */
export type Miga = { etiqueta: string; href?: string }

export function CabeceraDePagina({
  titulo,
  subtitulo,
  migas,
  acciones,
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  migas?: Miga[]
  acciones?: ReactNode
}) {
  return (
    <header className="admin-header cabecera-pagina">
      <div className="cabecera-pagina-texto">
        {migas && migas.length > 0 ? (
          <nav aria-label="Ruta">
            <ol className="migas">
              {migas.map((m, i) => (
                <li key={`${m.etiqueta}-${i}`}>
                  {i > 0 ? <ChevronRight aria-hidden size={14} /> : null}
                  {m.href ? <Link href={m.href}>{m.etiqueta}</Link> : <span aria-current="page">{m.etiqueta}</span>}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="admin-title">{titulo}</h1>
        {subtitulo ? <p className="admin-subtitle">{subtitulo}</p> : null}
      </div>
      {acciones ? <div className="cabecera-pagina-acciones">{acciones}</div> : null}
    </header>
  )
}
