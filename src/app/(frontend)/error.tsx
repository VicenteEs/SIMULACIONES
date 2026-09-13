'use client'

import Link from 'next/link'
import { useEffect } from 'react'

/**
 * Red de seguridad de toda la parte pública y del panel.
 *
 * Hasta ahora no había ninguna: `find src/app -name error.tsx` no devolvía
 * nada, así que cualquier excepción que subiera desde una página —el
 * `Forbidden` que Payload lanza al consultar un módulo vetado sin `catch`, una
 * relación que llega rota, una consulta que se va de tiempo— la atendía la
 * pantalla genérica de Next: en inglés, sin la barra de navegación y sin más
 * salida que el botón «atrás». Para un residente eso es indistinguible de «la
 * plataforma se cayó», y para quien la instaló, de que el despliegue está mal
 * hecho.
 *
 * Los ejemplos de arriba son de página a propósito, y la lista ya no empieza
 * por «la base que no responde», que es como estaba escrita: con la base caída
 * quien revienta primero es el layout, y ahí este archivo no llega. El porqué,
 * dos párrafos más abajo.
 *
 * Vive en `(frontend)` y no en la raíz de `src/app` a propósito: así queda por
 * dentro del layout del grupo y el aviso sale con la barra puesta y con los
 * estilos de la casa. Lo que no cubre hay que decirlo: un fallo del propio
 * layout —`obtenerSesion()`, que consulta la base en cada petición— no lo
 * atiende este archivo, porque un `error.tsx` no envuelve al layout de su mismo
 * segmento. De eso se ocupa `src/app/global-error.tsx`, que ya existe: pinta su
 * propio documento, sin barra y con los colores en línea, y solo entra cuando
 * ha reventado el layout raíz —la base caída, sin ir más lejos—.
 *
 * El reparto es ese, y conviene no confundirlo al tocar cualquiera de los dos:
 * lo que falla **dentro** de una página se queda aquí, con la plataforma entera
 * alrededor; lo que falla **antes** de que llegue a haber página se va allí.
 *
 * `retry` y no `reset`: desde Next 16.3 `retry` es la prop estable y vuelve a
 * pedir el contenido al servidor, mientras que `reset` se limita a repintar lo
 * que ya había en el cliente
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`).
 * Aquí lo que falla es casi siempre una consulta, así que repintar sin volver a
 * pedir devolvería exactamente la misma pantalla y el botón sería un engaño.
 */
export default function ErrorDeLaAplicacion({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // El servidor ya registró el fallo por su cuenta, pero lo que llega al
    // navegador no es ese error: en producción Next sustituye el mensaje por
    // uno genérico para no filtrar detalles internos, y lo único que cruza las
    // dos orillas es `digest`. Sin imprimirlo aquí, quien mira la consola del
    // navegador no tiene con qué buscar en el registro del servidor.
    console.error('[traumahub] fallo al pintar la página:', error.digest ?? '(sin código)', error)
  }, [error])

  return (
    <main>
      <h1>Algo se rompió al cargar esta página</h1>
      <div className="tarjeta">
        <p>
          No es por nada que usted haya hecho. Vuelva a intentarlo: si fue algo pasajero —la base
          de datos ocupada, la red del hospital— la página se rehace sola y la sesión sigue
          abierta.
        </p>
        <div className="row-botones">
          {/*
            El botón va antes que el enlace porque es la salida que conserva el
            trabajo: «Ir a la portada» abandona la página y en el panel eso
            puede ser un formulario a medio escribir.
          */}
          <button type="button" className="boton" onClick={() => retry()}>
            Volver a intentarlo
          </button>
          <Link className="boton secundario" href="/">
            Ir a la portada
          </Link>
        </div>
        {error.digest ? (
          <p className="aviso">
            Si vuelve a ocurrir, dé este código al equipo docente: <code>{error.digest}</code>. Con
            él se encuentra el fallo exacto en el registro del servidor.
          </p>
        ) : null}
      </div>
    </main>
  )
}
