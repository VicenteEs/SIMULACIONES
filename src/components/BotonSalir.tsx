'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salir } from '@/app/(frontend)/acciones/sesion'

/**
 * Cierre de sesión.
 *
 * Existe porque la plataforma se usa desde equipos compartidos del servicio, y
 * dejar la sesión abierta en el computador del pabellón no es aceptable en algo
 * cuyo acceso es cerrado por decisión (D-020).
 */
export function BotonSalir({ clase = 'enlace-nav' }: { clase?: string } = {}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()

  return (
    <button
      type="button"
      className={clase}
      disabled={enCurso}
      onClick={() =>
        iniciar(async () => {
          await salir()
          router.push('/entrar')
          router.refresh()
        })
      }
    >
      {enCurso ? 'Saliendo…' : 'Salir'}
    </button>
  )
}
