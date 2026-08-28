import Link from 'next/link'

/** Pantalla para quien no tiene sesión o su cuenta no está activa. */
export function SinAcceso({ titulo }: { titulo: string }) {
  return (
    <main>
      <h1>{titulo}</h1>
      <div className="tarjeta">
        <p>Necesita una cuenta activa para ver el contenido.</p>
        <a className="boton" href="/admin">
          Iniciar sesión
        </a>
      </div>
    </main>
  )
}

/**
 * Módulo sin contenido todavía.
 *
 * Se muestra qué falta y cómo crearlo, en lugar de una pantalla en blanco: la
 * plataforma nace vacía a propósito (D-016) y conviene que eso se lea como una
 * etapa del trabajo y no como una avería.
 */
export function Vacio({ texto, enlace, accion }: { texto: string; enlace?: string; accion?: string }) {
  return (
    <div className="tarjeta">
      <p>{texto}</p>
      {enlace && accion ? (
        <a className="boton" href={enlace}>
          {accion}
        </a>
      ) : null}
    </div>
  )
}

/** Enlace de vuelta al listado del módulo. */
export function Miga({ href, texto }: { href: string; texto: string }) {
  return (
    <nav className="miga">
      <Link href={href}>{texto}</Link>
    </nav>
  )
}
