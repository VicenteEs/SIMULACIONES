'use client'

import { useEffect } from 'react'
import { vigilarSalidasDelNavegador } from '@/admin/salidaDelEditor'

/**
 * La guardia de Atrás y Adelante del navegador, montada una sola vez en el
 * `layout.tsx` del panel.
 *
 * No pinta nada. Existe porque el `layout` es de servidor y no puede tocar
 * `window`, y porque tiene que estar montada mientras dure cualquier pantalla
 * del panel: la vigilancia es del panel entero y no de cada editor, que es lo
 * que evita que cada pantalla nueva con trabajo sin guardar tenga que acordarse
 * de poner la suya. Todo lo que decide está en `vigilarSalidasDelNavegador`
 * (`src/admin/salidaDelEditor.ts`), fuera de React, para poder probarlo sin
 * navegador.
 *
 * Una sola, y no una por pantalla: dos a la vez preguntarían dos veces por el
 * mismo viaje, y la segunda pregunta llegaría con la vuelta ya en marcha.
 */
export function GuardiaDeAtras() {
  useEffect(() => {
    const navegador = window as Window & {
      navigation?: EventTarget & {
        readonly currentEntry: { key: string; index: number; url: string | null } | null
      }
    }
    return vigilarSalidasDelNavegador({
      ventana: window,
      historial: window.history,
      navegacion: navegador.navigation,
      eventoPopstate: typeof PopStateEvent === 'undefined' ? undefined : PopStateEvent,
      // El mismo `confirm` que la barra lateral, con la frase que pone el
      // registro: bloquea, y la vuelta tiene que esperar a la respuesta.
      preguntar: (texto) => window.confirm(texto),
      despues: (tarea) => {
        window.setTimeout(tarea, 0)
      },
    })
  }, [])

  return null
}
