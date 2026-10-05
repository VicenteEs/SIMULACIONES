'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Marca } from '@/admin/concurrencia'
import {
  COPIA_LOCAL_CADA_MS,
  decidirRecuperacion,
  leerCopia,
  serializarCopia,
  type CopiaLocal,
} from '@/lib/guardadoAutomatico'

/**
 * La copia de la ficha en el `localStorage` de este navegador (ver
 * `src/lib/guardadoAutomatico.ts`, donde está el porqué y todo lo que decide).
 *
 * Aquí solo lo que toca el almacén, envuelto entero en `try`: en una ventana
 * privada de Safari, con el almacén lleno o con los datos del sitio
 * bloqueados, `localStorage` lanza al leer o al escribir, y una copia de
 * seguridad no puede ser lo que rompa el editor. Si falla, `fallo` lo dice y el
 * indicador de la barra deja de prometer una copia que no hay.
 *
 * Cuándo se escribe: cada `COPIA_LOCAL_CADA_MS` mientras haya cambios sin
 * guardar —y solo si hubo teclas desde la última copia—, y en el acto al
 * ocultarse la pestaña o al irse de la página, que es lo último que se oye de
 * una pestaña antes de que la cierren o de que el sistema la descarte.
 *
 * Mientras se está ofreciendo recuperar una copia anterior, no se escribe
 * encima: lo nuevo que se teclee entretanto taparía justo lo que se ofrece
 * recuperar. La banda queda a la vista hasta que la persona decida.
 */
export function useCopiaLocal({
  clave,
  sucio,
  valores,
  ediciones,
  marca,
  servidor,
}: {
  clave: string
  sucio: boolean
  valores: Record<string, unknown>
  /** El contador de teclas del formulario: si no se movió, la copia ya está al día. */
  ediciones: RefObject<number>
  marca: RefObject<Marca>
  /** El documento tal como llegó del servidor al abrir la ficha. */
  servidor: { marca: Marca; valores: Record<string, unknown> }
}) {
  const [oferta, setOferta] = useState<{ copia: CopiaLocal; otraVersion: boolean } | null>(null)
  const [ultimaCopia, setUltimaCopia] = useState<number | null>(null)
  const [fallo, setFallo] = useState(false)

  // Lo último, leído al escribir desde un temporizador o un evento, que se
  // quedarían con el `valores` del pintado en que se programaron.
  const ultimos = useRef({ valores, clave, sucio, ofreciendo: false })
  useEffect(() => {
    ultimos.current = { valores, clave, sucio, ofreciendo: oferta !== null }
  })
  const escritasCon = useRef<number | null>(null)

  /**
   * Al abrir: ¿hay algo que ofrecer? Solo una vez por clave, contra el
   * documento con el que se abrió.
   *
   * Es un efecto y no el valor inicial del estado porque `localStorage` no
   * existe en el servidor: leerlo al pintar daría un HTML distinto en cada
   * lado y React lo rechazaría al hidratar.
   */
  const servidorAlAbrir = useRef(servidor)
  useEffect(() => {
    let texto: string | null = null
    try {
      texto = window.localStorage.getItem(clave)
    } catch {
      return
    }
    const decision = decidirRecuperacion(leerCopia(texto, Date.now()), servidorAlAbrir.current)
    if (decision.tipo === 'descartar' || (decision.tipo === 'nada' && texto)) {
      try {
        window.localStorage.removeItem(clave)
      } catch {
        // Nada que hacer: se volverá a mirar la próxima vez.
      }
    }
    if (decision.tipo === 'ofrecer') setOferta({ copia: decision.copia, otraVersion: decision.otraVersion })
  }, [clave])

  const escribir = useCallback(() => {
    const { valores: v, clave: k, sucio: s, ofreciendo } = ultimos.current
    if (!s || ofreciendo) return
    if (escritasCon.current === ediciones.current) return
    try {
      const ahora = Date.now()
      window.localStorage.setItem(
        k,
        serializarCopia({ version: 1, guardadaEn: ahora, marca: marca.current, valores: v }),
      )
      escritasCon.current = ediciones.current
      setUltimaCopia(ahora)
      setFallo(false)
    } catch {
      setFallo(true)
    }
  }, [ediciones, marca])

  useEffect(() => {
    if (!sucio) return
    const reloj = window.setInterval(escribir, COPIA_LOCAL_CADA_MS)
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') escribir()
    }
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', escribir)
    return () => {
      window.clearInterval(reloj)
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', escribir)
    }
  }, [sucio, escribir])

  /** Tras un guardado bueno: lo que había que proteger ya está en la base. */
  const borrar = useCallback(() => {
    escritasCon.current = null
    setUltimaCopia(null)
    try {
      window.localStorage.removeItem(ultimos.current.clave)
    } catch {
      // Si no se puede borrar, la próxima apertura la encontrará igual al
      // servidor y la descartará sola (`decidirRecuperacion`).
    }
  }, [])

  /** La persona eligió: recuperar o descartar. Ya no se ofrece, y se vuelve a copiar. */
  const cerrarOferta = useCallback(() => {
    setOferta(null)
    ultimos.current.ofreciendo = false
  }, [])

  return { oferta, ultimaCopia, fallo, borrar, cerrarOferta }
}
