'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { latidoDeRevision } from '@/app/(frontend)/acciones/revision'
import {
  INACTIVIDAD_QUE_NO_CUENTA_MS,
  LATIDO_DE_REVISION_MS,
  SEGUNDOS_PARA_DAR_POR_VISTA,
} from '@/lib/revision'

/**
 * Mide cuánto tiempo pasa un revisor con una ficha en revisión (D-142).
 *
 * Cuenta, segundo a segundo, dos cosas distintas: el tiempo con la pestaña a
 * la vista (`abiertos`) y el tiempo con alguien delante (`activos`): una tecla,
 * un clic, la rueda o el ratón moviéndose en los últimos noventa segundos
 * (`INACTIVIDAD_QUE_NO_CUENTA_MS`). El dueño pidió las dos, y la segunda es la
 * que importa: «no quiero que validen por validar», y una pestaña olvidada
 * también está abierta. Lo activo se reparte además por la sección que se
 * tenía delante, que es lo que dice si se llegó a mirar «Manejo».
 *
 * Cada `LATIDO_DE_REVISION_MS` manda lo acumulado y empieza de cero; también
 * al ocultarse la pestaña, que es lo último que se oye de ella antes de
 * cerrarla. Si el envío falla, lo medido se devuelve a la cuenta y viaja en el
 * siguiente: el servidor lo recorta al tiempo que de verdad pasó
 * (`techoDelLatido`), así que reintentar no infla nada.
 *
 * No mide nada fuera de una ficha en revisión, ni en una ficha nueva: `activo`
 * lo decide quien la usa.
 */
export function useSeguimientoDeRevision({
  activo,
  coleccion,
  id,
  seccion,
}: {
  activo: boolean
  coleccion: string
  id: string | null
  /** Título de la pestaña abierta. */
  seccion: string
}) {
  /**
   * Uno por pestaña y por montaje. `useState` con inicializador y no un `ref`
   * con `crypto.randomUUID()` dentro, que se evaluaría en cada pintado.
   */
  const [sesion] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
  )
  const acumulado = useRef({ abiertos: 0, activos: 0, porSeccion: {} as Record<string, number>, ediciones: 0 })
  /** Cuándo tocó algo por última vez. Se pone en marcha al activarse, en el efecto de abajo. */
  const ultimaInteraccion = useRef(0)
  const seccionActual = useRef(seccion)
  const enviando = useRef(false)
  /**
   * El servidor dijo que la ficha ya no está en revisión: un administrador la
   * sacó con el editor abierto. Desde ahí no se mide ni se manda nada. Antes la
   * respuesta se descartaba y el editor seguía latiendo cada quince segundos
   * hasta cerrarse, cada latido con su consulta, para que el servidor
   * contestara siempre lo mismo.
   */
  const fueraDeRevision = useRef(false)
  /**
   * Lo que se ha visto en esta sesión, para marcar las pestañas sin esperar al
   * servidor. Los segundos van en un `ref` y el estado solo cambia cuando una
   * sección llega al umbral: repintar el editor entero —con sus textos ricos—
   * cada segundo para no enseñar nada nuevo sería el precio de medir.
   */
  const segundosAqui = useRef<Record<string, number>>({})
  const [vistasAqui, setVistasAqui] = useState<string[]>([])

  useEffect(() => {
    seccionActual.current = seccion
  }, [seccion])

  const enviar = useCallback(async () => {
    if (!activo || !id || enviando.current || fueraDeRevision.current) return
    const { abiertos, activos, porSeccion, ediciones } = acumulado.current
    if (abiertos === 0 && ediciones === 0) return
    acumulado.current = { abiertos: 0, activos: 0, porSeccion: {}, ediciones: 0 }
    enviando.current = true
    try {
      const respuesta = await latidoDeRevision(coleccion, id, sesion, { abiertos, activos, porSeccion, ediciones })
      if (!respuesta.exito) throw new Error(respuesta.mensaje)
      if (respuesta.datos?.enRevision === false) fueraDeRevision.current = true
    } catch {
      // Se devuelve a la cuenta: viajará en el siguiente latido.
      const ahora = acumulado.current
      ahora.abiertos += abiertos
      ahora.activos += activos
      ahora.ediciones += ediciones
      for (const [clave, segundos] of Object.entries(porSeccion)) {
        ahora.porSeccion[clave] = (ahora.porSeccion[clave] ?? 0) + segundos
      }
    } finally {
      enviando.current = false
    }
  }, [activo, coleccion, id, sesion])

  // Qué cuenta como «alguien delante». `pointermove` también, pero no más de
  // una vez por segundo: pasa decenas de veces por segundo y basta con saber
  // que pasó.
  useEffect(() => {
    if (!activo) return
    // Abrir la ficha ya es tener a alguien delante: el primer minuto cuenta
    // aunque todavía no se haya tocado nada.
    ultimaInteraccion.current = Date.now()
    let ultimoMovimiento = 0
    const tocar = () => {
      ultimaInteraccion.current = Date.now()
    }
    const mover = () => {
      const ahora = Date.now()
      if (ahora - ultimoMovimiento < 1000) return
      ultimoMovimiento = ahora
      ultimaInteraccion.current = ahora
    }
    const opciones = { passive: true, capture: true } as const
    window.addEventListener('keydown', tocar, opciones)
    window.addEventListener('pointerdown', tocar, opciones)
    window.addEventListener('wheel', tocar, opciones)
    window.addEventListener('scroll', tocar, opciones)
    window.addEventListener('pointermove', mover, opciones)
    return () => {
      window.removeEventListener('keydown', tocar, opciones)
      window.removeEventListener('pointerdown', tocar, opciones)
      window.removeEventListener('wheel', tocar, opciones)
      window.removeEventListener('scroll', tocar, opciones)
      window.removeEventListener('pointermove', mover, opciones)
    }
  }, [activo])

  // El reloj: un segundo cada vez, y solo con la pestaña a la vista.
  useEffect(() => {
    if (!activo) return
    const reloj = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || fueraDeRevision.current) return
      const cuenta = acumulado.current
      cuenta.abiertos += 1
      if (Date.now() - ultimaInteraccion.current <= INACTIVIDAD_QUE_NO_CUENTA_MS) {
        cuenta.activos += 1
        const titulo = seccionActual.current
        cuenta.porSeccion[titulo] = (cuenta.porSeccion[titulo] ?? 0) + 1
        const aqui = (segundosAqui.current[titulo] ?? 0) + 1
        segundosAqui.current[titulo] = aqui
        if (aqui === SEGUNDOS_PARA_DAR_POR_VISTA) setVistasAqui((antes) => [...antes, titulo])
      }
    }, 1000)
    return () => window.clearInterval(reloj)
  }, [activo])

  // Los latidos, y uno más al ocultar la pestaña o al irse.
  useEffect(() => {
    if (!activo) return
    const latido = window.setInterval(() => void enviar(), LATIDO_DE_REVISION_MS)
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') void enviar()
    }
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', alOcultar)
    return () => {
      window.clearInterval(latido)
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', alOcultar)
      // Al desmontar —volver al listado, abrir otra ficha— se manda lo que
      // quede. Si la página se está yendo, puede no llegar: son segundos.
      void enviar()
    }
  }, [activo, enviar])

  /** Un campo tocado: cuenta como edición y como actividad. */
  const contarEdicion = useCallback(() => {
    acumulado.current.ediciones += 1
    ultimaInteraccion.current = Date.now()
  }, [])

  return { sesion, contarEdicion, vistasAqui, enviarAhora: enviar }
}
