import { Building2 } from 'lucide-react'

/**
 * Lo que se ve en el subdominio de una institución que no existe (D-396):
 * `nadie.traumahub.cl`, un enlace mal copiado o un piloto que se borró.
 *
 * Lo pinta la plantilla en lugar de la página pedida, sin barra y sin sesión:
 * en un subdominio así no vale ninguna cuenta (`obtenerSesion`), ni la central.
 * No es la pantalla de 404 de las fichas porque aquella ofrece la biblioteca y
 * la portada de este mismo anfitrión, y aquí no hay ninguna de las dos.
 *
 * El enlace a la central va con la dirección entera y sin `ruta()`: lleva a
 * otro anfitrión, y `direccionPublica()` ya trae el prefijo dentro.
 */
export function InstitucionQueNoExiste({ subdominio, central }: { subdominio: string; central: string }) {
  return (
    <main>
      <div className="estado">
        <span className="estado-icono" aria-hidden="true">
          <Building2 size={34} strokeWidth={1.6} />
        </span>
        <h1>Esta institución no existe</h1>
        <p>
          No hay ninguna institución en TraumaHub con el nombre <strong>{subdominio}</strong>. Revise la
          dirección que le enviaron, o pregunte a quien administra la plataforma en su institución.
        </p>
        {central ? (
          <div className="fila-botones">
            <a className="boton" href={central}>
              Ir a TraumaHub
            </a>
          </div>
        ) : null}
      </div>
    </main>
  )
}
