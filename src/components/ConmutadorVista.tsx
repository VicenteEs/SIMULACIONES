'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

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

  if (rolReal === 'lector') return null

  async function cambiar(rol: string | null) {
    setOcupado(true)
    await fetch('/api/vista-previa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol }),
    })
    router.refresh()
    setOcupado(false)
  }

  return simulando ? (
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
  )
}
