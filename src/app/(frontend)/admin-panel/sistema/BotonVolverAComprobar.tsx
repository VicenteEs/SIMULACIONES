'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

/**
 * «Volver a comprobar», el botón de la cabecera de Sistema (P-007 E5, D-238).
 *
 * Repite las comprobaciones pidiendo la página otra vez al servidor, que es
 * donde se hacen: el saludo al servidor de correo, el `statfs`, la lectura del
 * directorio de respaldos. `router.refresh()` y no un enlace a la misma
 * dirección porque conserva lo plegado y la posición, y porque mientras viaja
 * el botón puede decir que está en ello: la comprobación del correo espera
 * hasta cuatro segundos a un servidor que no contesta, y un botón que no
 * cambia en ese rato se pulsa tres veces.
 */
export function BotonVolverAComprobar() {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  return (
    <button
      type="button"
      className="admin-btn admin-btn-secondary"
      onClick={() => iniciar(() => router.refresh())}
      disabled={enCurso}
    >
      <RefreshCw aria-hidden size={16} className={enCurso ? 'sistema-girando' : undefined} />
      {enCurso ? 'Comprobando…' : 'Volver a comprobar'}
    </button>
  )
}
