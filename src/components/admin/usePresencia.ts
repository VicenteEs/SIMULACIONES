'use client'

import { useEffect, useRef, useState } from 'react'
import { ruta } from '@/lib/rutas'
import { LATIDO_OCULTO_MS, LATIDO_VISIBLE_MS, type OtroEditor } from '@/lib/presencia'

/**
 * Late mientras la ficha está abierta y cuenta quién más la tiene abierta.
 *
 * El porqué de todo —en memoria, cada cuánto, qué caduca— está en
 * `src/lib/presencia.ts`. Aquí solo lo que es del navegador:
 *
 *  - Un identificador por pestaña y por montaje, para que la misma persona con
 *    dos pestañas no se vea a sí misma como «otro editor» y sí se le pueda
 *    decir que tiene la ficha abierta dos veces, que también choca. No va en
 *    `sessionStorage`: «Duplicar pestaña» copia ese almacén, y las dos
 *    pestañas se creerían la misma.
 *  - Al ocultarse la pestaña se late en el acto con `visible: false` y después
 *    al ritmo lento; al volver, en el acto otra vez. Lo que ven los demás se
 *    pone al día en cuanto cambia, no al siguiente latido.
 *  - Al irse —desmontar el editor o cerrar la pestaña— se despide con
 *    `keepalive`, que es lo único que sobrevive a una página que se descarga.
 *    Si no llega, caduca sola.
 *  - Un 401 o 403 para los latidos: la sesión cayó o el permiso se retiró, y
 *    repetir cada quince segundos solo llenaría el registro. Un fallo de red,
 *    en cambio, se reintenta en el siguiente: es justo cuando más falta hace
 *    saber quién sigue ahí al volver.
 */
export function usePresencia({
  coleccion,
  id,
}: {
  coleccion: string
  /** `null` en una ficha nueva: nadie más puede tenerla abierta. */
  id: string | null
}) {
  const [pestana] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
  )
  const [estado, setEstado] = useState<{
    otros: OtroEditor[]
    misOtrasPestanas: number
    /** Diferencia entre el reloj del servidor y este, para contar «desde hace». */
    desfase: number
  }>({ otros: [], misOtrasPestanas: 0, desfase: 0 })
  const parado = useRef(false)

  useEffect(() => {
    if (id === null) return
    parado.current = false
    let temporizador: number | undefined
    let vigente = true
    const direccion = ruta('/api/presencia')

    const latir = async () => {
      if (parado.current) return
      const visible = document.visibilityState === 'visible'
      try {
        const r = await fetch(direccion, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coleccion, id, pestana, visible }),
          cache: 'no-store',
        })
        if (r.status === 401 || r.status === 403) {
          parado.current = true
          return
        }
        if (!r.ok) return
        const datos = (await r.json()) as { ahora: number; otros: OtroEditor[]; misOtrasPestanas: number }
        if (vigente) {
          setEstado({ otros: datos.otros, misOtrasPestanas: datos.misOtrasPestanas, desfase: datos.ahora - Date.now() })
        }
      } catch {
        // Sin red: se reintenta en el siguiente latido, con lo último que se supo en pantalla.
      }
    }

    const programar = () => {
      window.clearTimeout(temporizador)
      if (!vigente) return
      const espera = document.visibilityState === 'visible' ? LATIDO_VISIBLE_MS : LATIDO_OCULTO_MS
      temporizador = window.setTimeout(() => {
        void latir().finally(programar)
      }, espera)
    }

    const alCambiarVisibilidad = () => {
      void latir()
      programar()
    }

    const despedirse = () => {
      try {
        void fetch(direccion, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coleccion, id, pestana, salir: true }),
          keepalive: true,
        }).catch(() => undefined)
      } catch {
        // Un navegador que rehúsa `keepalive` aquí: la entrada caduca sola.
      }
    }

    void latir()
    programar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    window.addEventListener('pagehide', despedirse)
    return () => {
      vigente = false
      window.clearTimeout(temporizador)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.removeEventListener('pagehide', despedirse)
      despedirse()
    }
  }, [coleccion, id, pestana])

  return estado
}
