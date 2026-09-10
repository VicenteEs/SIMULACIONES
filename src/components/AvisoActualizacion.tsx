'use client'

import React from 'react'
import { ruta } from '@/lib/rutas'
import { NOMBRE_DE_MODULO } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Aviso de contenido actualizado.
 *
 * Escucha el flujo de publicaciones y, cuando la versión cambia, ofrece
 * recargar. Nunca recarga por su cuenta: quien está leyendo decide cuándo.
 */
export function AvisoActualizacion() {
  const [hayNovedad, setHayNovedad] = React.useState(false)
  // Qué se publicó. Viajaba en el flujo desde el principio y no lo miraba
  // nadie: el aviso decía «hay contenido actualizado» y el residente no sabía
  // si le interesaba lo bastante como para perder dónde iba leyendo.
  const [queCambio, setQueCambio] = React.useState<string | null>(null)
  const versionInicial = React.useRef<number | null>(null)

  React.useEffect(() => {
    const fuente = new EventSource(ruta('/api/cambios'))

    fuente.onmessage = (evento) => {
      try {
        const { version, modulo } = JSON.parse(evento.data) as {
          version: number
          modulo: string | null
        }
        if (versionInicial.current === null) {
          versionInicial.current = version
        } else if (version > versionInicial.current) {
          setHayNovedad(true)
          setQueCambio(modulo ? (NOMBRE_DE_MODULO[modulo] ?? null) : null)
        } else if (version < versionInicial.current) {
          // La cuenta atrás bajó: el servidor se reinició y su contador, que
          // vive en memoria, volvió a empezar. No hay contenido nuevo. Antes se
          // comparaba con `!==` y cada reinicio sacaba un aviso falso.
          versionInicial.current = version
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
      <span>
        {queCambio ? `Hay contenido nuevo en ${queCambio}.` : 'Hay contenido actualizado.'}
      </span>
      <button type="button" onClick={() => window.location.reload()}>
        Recargar
      </button>
    </div>
  )
}
