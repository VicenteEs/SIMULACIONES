'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { aceptarElAvisoDePrivacidad } from '@/app/(frontend)/acciones/privacidad'

/**
 * «Acepto»: anota la versión que esta pantalla enseña y deja seguir (D-292).
 *
 * Manda la versión que recibió del servidor al pintar, no la que tenga el
 * paquete del navegador: si el aviso cambió entre que se pintó la pantalla y
 * que se pulsa, la acción lo rechaza con su frase y aquí se enseña.
 *
 * Después de aceptar se refresca y no se navega: la página que la persona
 * pidió es la que tiene que aparecer, y la plantilla ya la tiene detrás.
 */
export function BotonAceptarElAviso({ version }: { version: string }) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        className="boton"
        disabled={enCurso}
        onClick={() =>
          iniciar(async () => {
            setError(null)
            const respuesta = await aceptarElAvisoDePrivacidad(version)
            if (!respuesta.exito) {
              setError(respuesta.mensaje ?? 'No se pudo anotar la aceptación. Inténtalo otra vez.')
              return
            }
            router.refresh()
          })
        }
      >
        <Check size={16} aria-hidden="true" />
        {enCurso ? 'Anotando…' : 'Acepto el aviso'}
      </button>
      {error ? (
        <p className="aviso-por-aceptar-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  )
}
