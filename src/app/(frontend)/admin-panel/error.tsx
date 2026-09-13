'use client'

import Link from 'next/link'
import { useEffect } from 'react'

/**
 * La red de seguridad del panel, para que un fallo no se lleve por delante el
 * panel entero.
 *
 * Sin este archivo, la excepción de cualquier página de `admin-panel` subía
 * hasta `(frontend)/error.tsx`, que está por encima del layout del panel: el
 * límite que atiende sustituye todo lo que hay debajo, así que el administrador
 * perdía la barra lateral y aterrizaba en una pantalla con los estilos de la
 * parte pública. Y lo que ofrecía era «Ir a la portada», es decir, salir del
 * panel: justo lo contrario de lo que hace falta cuando lo que se quiere es
 * mirar la sección de sistema para ver qué se rompió.
 *
 * El reparto en tres, que conviene tener entero antes de tocar cualquiera de
 * los tres archivos, porque cada uno cubre lo que el de arriba no puede:
 *
 * - Falla una **página** del panel (una consulta, una tabla que falta): entra
 *   este archivo, con la barra lateral puesta.
 * - Falla `admin-panel/layout.tsx` —`obtenerSesion()`, el conteo de comentarios
 *   pendientes—: un `error.tsx` no envuelve al layout de su mismo segmento
 *   (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`),
 *   así que eso sube a `(frontend)/error.tsx`.
 * - Falla `(frontend)/layout.tsx`, que es lo que pasa con la base caída: sube
 *   hasta `src/app/global-error.tsx`.
 *
 * `retry` y no `reset`, igual que en los otros dos: `reset` se limita a
 * repintar lo que ya hay en el cliente, y aquí lo que falla es casi siempre una
 * consulta. Repintar sin volver a pedir devolvería esta misma pantalla y el
 * botón sería un engaño.
 */
export default function ErrorDelPanel({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // En producción Next sustituye el mensaje por uno genérico para no filtrar
    // detalles internos, y lo único que cruza del servidor al navegador es
    // `digest`. Sin imprimirlo, quien mire la consola no tiene con qué buscar
    // en el registro del servidor.
    console.error('[panel] fallo al pintar la sección:', error.digest ?? '(sin código)', error)
  }, [error])

  return (
    <div>
      <header className="admin-header">
        <h1 className="admin-title">Esta sección no se pudo cargar</h1>
        <p className="admin-subtitle">El resto del panel sigue funcionando.</p>
      </header>

      <div className="admin-aviso admin-aviso-error" role="status">
        <strong>Algo falló al leer los datos de esta pantalla.</strong>
        Lo corriente es que falte una tabla —un cambio de esquema desplegado sin su migración— o
        que una consulta se haya ido de tiempo. No se ha perdido contenido: esta pantalla solo lee.
        {error.digest ? (
          <>
            {' '}
            El fallo exacto queda en el registro del servidor, bajo el código{' '}
            <code>{error.digest}</code>.
          </>
        ) : (
          ' El fallo exacto queda en el registro del servidor.'
        )}
      </div>

      <div className="admin-acciones">
        {/*
          El reintento va primero porque es la salida que no abandona la
          sección: si el fallo fue pasajero —la base ocupada—, la pantalla se
          rehace en su sitio y no hay que volver a navegar hasta aquí.
        */}
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => retry()}>
          Volver a intentarlo
        </button>
        {/*
          La segunda salida es el resumen y no «Sistema», que sería el sitio
          natural para diagnosticar esto: esa sección es solo de administrador
          (`exigirPanel('admin')`) y a un editor lo devolvería a la portada sin
          explicar por qué, que es peor que no ofrecerle el enlace. El
          administrador la tiene en la barra lateral, que aquí sigue puesta.
        */}
        <Link className="admin-btn admin-btn-secondary" href="/admin-panel">
          Volver al resumen
        </Link>
      </div>
    </div>
  )
}
