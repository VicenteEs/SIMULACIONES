'use client'

import React from 'react'

/**
 * Aviso de contenido actualizado.
 *
 * Escucha el flujo de publicaciones y, cuando la versión cambia, ofrece
 * recargar. Nunca recarga por su cuenta: quien está leyendo decide cuándo.
 */
export function AvisoActualizacion() {
  const [hayNovedad, setHayNovedad] = React.useState(false)
  const versionInicial = React.useRef<number | null>(null)

  React.useEffect(() => {
    const fuente = new EventSource('/api/cambios')

    fuente.onmessage = (evento) => {
      try {
        const { version } = JSON.parse(evento.data) as { version: number }
        if (versionInicial.current === null) {
          versionInicial.current = version
        } else if (version !== versionInicial.current) {
          setHayNovedad(true)
        }
      } catch {
        // Un mensaje ilegible no debe romper la página: se ignora.
      }
    }

    // Si la conexión se corta, el navegador reintenta solo. No se avisa de
    // nada: una caída de red no es contenido nuevo.
    fuente.onerror = () => {}

    return () => fuente.close()
  }, [])

  if (!hayNovedad) return null

  return (
    <div className="aviso-actualizacion" role="status">
      <span>Hay contenido actualizado.</span>
      <button type="button" onClick={() => window.location.reload()}>
        Recargar
      </button>
    </div>
  )
}
