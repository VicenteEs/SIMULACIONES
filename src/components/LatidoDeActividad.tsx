'use client'

import { useEffect } from 'react'
import { registrarLatidoDeActividad } from '@/app/(frontend)/acciones/registro'
import { INACTIVIDAD_DE_LA_CUENTA_MS, LATIDO_DE_ACTIVIDAD_MS } from '@/lib/registro'

/**
 * Manda el latido que mide cuánto tiempo está activa la cuenta (D-145).
 *
 * «Activa» quiere decir dos cosas a la vez: la pestaña se ve (no está detrás de
 * otra ni con la pantalla apagada) y alguien la ha tocado hace menos de
 * `INACTIVIDAD_DE_LA_CUENTA_MS`. Con solo lo primero, una pestaña olvidada en
 * un segundo monitor sumaría ocho horas; con solo lo segundo, quien lee una
 * ficha larga con calma dejaría de contar mientras lee.
 *
 * No pinta nada. La ruta se lee de `window.location` en cada latido y no de
 * `usePathname`: si el efecto dependiera de ella, el temporizador se
 * reiniciaría con cada cambio de página y quien navega rápido nunca llegaría a
 * ver salir un latido.
 */
export function LatidoDeActividad() {
  useEffect(() => {
    let ultimaInteraccion = Date.now()
    const tocar = () => {
      ultimaInteraccion = Date.now()
    }
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const
    for (const e of eventos) window.addEventListener(e, tocar, { passive: true })

    const latir = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimaInteraccion > INACTIVIDAD_DE_LA_CUENTA_MS) return
      // Sin `await` ni `catch`: la acción no propaga nada.
      registrarLatidoDeActividad(window.location.pathname)
    }
    const temporizador = window.setInterval(latir, LATIDO_DE_ACTIVIDAD_MS)
    // El primero, al entrar: abre la fila del día y fija el punto desde el que
    // se empieza a contar.
    latir()

    return () => {
      window.clearInterval(temporizador)
      for (const e of eventos) window.removeEventListener(e, tocar)
    }
  }, [])

  return null
}
