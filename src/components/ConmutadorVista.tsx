'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { ruta } from '@/lib/rutas'

/**
 * Conmutador «ver como residente».
 *
 * Cambia el rol con el que se resuelven las consultas sin cerrar la sesión.
 * El servidor valida el cambio: aquí solo se ofrece la opción a quien puede
 * usarla.
 */
export function ConmutadorVista({ rolReal, simulando }: { rolReal: string; simulando: boolean }) {
  const router = useRouter()
  const [ocupado, setOcupado] = React.useState(false)
  const [error, setError] = React.useState('')

  if (rolReal === 'lector') return null

  async function cambiar(rol: string | null) {
    setOcupado(true)
    setError('')
    try {
      const respuesta = await fetch(ruta('/api/vista-previa'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol }),
      })
      if (!respuesta.ok) {
        // El 401 y el 403 de `api/vista-previa` se procesaban igual que un 200:
        // la página se refrescaba idéntica y el editor no llegaba a saber si el
        // conmutador no funciona o si la vista previa no le corresponde.
        setError('No se pudo cambiar la vista.')
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo cambiar la vista.')
    } finally {
      // En `finally` a propósito: sin él, un fetch rechazado —red caída, el
      // servidor reiniciándose durante un despliegue— dejaba `ocupado` en
      // `true` y el botón en gris, muerto, hasta recargar la página entera.
      setOcupado(false)
    }
  }

  return (
    <>
      {simulando ? (
        <div className="aviso-vista">
          <span>Está viendo la plataforma como residente.</span>
          <button type="button" onClick={() => cambiar(null)} disabled={ocupado}>
            Volver a mi vista
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="enlace-nav"
          onClick={() => cambiar('lector')}
          disabled={ocupado}
        >
          Ver como residente
        </button>
      )}

      {/* Se reaprovecha la píldora de aviso de la barra en lugar de una clase
          nueva: el mensaje aparece en el mismo hueco, en la barra ancha y en el
          pie del menú del teléfono, y ya está dimensionado para los dos. */}
      {error ? (
        <span className="aviso-vista" role="status">
          {error}
        </span>
      ) : null}
    </>
  )
}
