import type { ReactNode } from 'react'

/**
 * La tarjeta que lleva un gráfico o una tabla en los tableros del panel (P-007
 * E5, D-238).
 *
 * El título dice lo que el gráfico responde —«Lecturas por día», «¿Dónde se
 * atasca la cola?»— y la bajada, de dónde sale y qué periodo cubre. Penpot lo
 * dibuja así en las dieciséis pestañas, y es lo que permite leer el panel sin
 * descifrar ejes: quien mira sabe qué pregunta tiene delante antes de ver el
 * dibujo.
 *
 * `ilegible` pinta el borde ámbar de `.admin-card-ilegible`, el mismo de las
 * cifras, para que una tarjeta cuya consulta falló no se confunda con una
 * tarjeta vacía. El aviso de qué falló lo pone quien la usa, con
 * `NoSePudoLeer`.
 *
 * `h2` porque cuelga directamente del `h1` de `CabeceraDePagina`; dentro de una
 * sección con su propio `h2`, `nivel={3}`.
 */
export function TarjetaDeGrafico({
  titulo,
  bajada,
  acciones,
  ancha,
  ilegible,
  nivel = 2,
  className,
  children,
}: {
  titulo: string
  bajada?: ReactNode
  /** Lo que va a la derecha del título: «Ver registro completo», un selector. */
  acciones?: ReactNode
  /** Ocupa toda la fila de una `.admin-grid`. */
  ancha?: boolean
  ilegible?: boolean
  nivel?: 2 | 3
  className?: string
  children: ReactNode
}) {
  const Titulo = nivel === 2 ? 'h2' : 'h3'
  const clases = ['admin-card', 'tarjeta-grafico', ancha ? 'admin-card-ancha' : null, ilegible ? 'admin-card-ilegible' : null, className]
  return (
    <section className={clases.filter(Boolean).join(' ')}>
      <header className="tarjeta-grafico-cabeza">
        <div className="tarjeta-grafico-texto">
          <Titulo className="tarjeta-grafico-titulo">{titulo}</Titulo>
          {bajada ? <p className="tarjeta-grafico-bajada">{bajada}</p> : null}
        </div>
        {acciones ? <div className="tarjeta-grafico-acciones">{acciones}</div> : null}
      </header>
      {children}
    </section>
  )
}
