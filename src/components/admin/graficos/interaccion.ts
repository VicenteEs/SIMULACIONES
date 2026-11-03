'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'

/**
 * Lo que comparten los gráficos que responden al ratón y al teclado (P-007 E1).
 *
 * El globo de las barras del panel salía solo al pasar el ratón, aunque su
 * comentario prometía también el tabulador: la rejilla iba entera con
 * `aria-hidden` y ninguna columna se podía enfocar. Poner un `tabIndex` en cada
 * barra tampoco servía: una pieza enfocable dentro de algo oculto al lector de
 * pantalla es justo el fallo que señala cualquier auditoría de accesibilidad, y
 * doce paradas de tabulador por gráfico hacen intransitable el panel.
 *
 * El gráfico entero es **una** parada: se enfoca, las flechas recorren los
 * puntos y una región viva anuncia el que queda marcado. El dibujo sigue oculto
 * al lector, que tiene además la tabla con todas las cifras.
 */
export function useRecorrido(cuantos: number) {
  const [activo, setActivo] = useState<number | null>(null)

  const alTeclear = useCallback(
    (evento: KeyboardEvent) => {
      if (cuantos === 0) return
      const actual = activo ?? -1
      let siguiente: number | null = null
      if (evento.key === 'ArrowRight' || evento.key === 'ArrowDown') siguiente = Math.min(cuantos - 1, actual + 1)
      else if (evento.key === 'ArrowLeft' || evento.key === 'ArrowUp')
        siguiente = Math.max(0, actual < 0 ? cuantos - 1 : actual - 1)
      else if (evento.key === 'Home') siguiente = 0
      else if (evento.key === 'End') siguiente = cuantos - 1
      else if (evento.key === 'Escape') {
        setActivo(null)
        return
      }
      if (siguiente === null) return
      // Las flechas no deben mover la página mientras se recorre el gráfico.
      evento.preventDefault()
      setActivo(siguiente)
    },
    [activo, cuantos],
  )

  return {
    activo,
    setActivo,
    propiedades: {
      tabIndex: 0,
      onKeyDown: alTeclear,
      onBlur: () => setActivo(null),
    },
  }
}

/**
 * El ancho real del contenedor, para dibujar en píxeles de verdad.
 *
 * Un SVG con `preserveAspectRatio="none"` se estira al ancho de la tarjeta y
 * deforma lo que dibuja: los puntos salen ovalados y el trazo engorda o
 * adelgaza según la pantalla (lo que llevó a las barras de `Graficos.tsx` a ser
 * HTML). Midiendo el contenedor, el dibujo se rehace a su tamaño y un círculo
 * sigue siendo un círculo. Hasta la primera medida se usa `inicial`, que es lo
 * que se pinta en el servidor.
 */
export function useAncho<T extends HTMLElement>(inicial = 560) {
  const referencia = useRef<T | null>(null)
  const [ancho, setAncho] = useState(inicial)

  useEffect(() => {
    const nodo = referencia.current
    if (!nodo || typeof ResizeObserver === 'undefined') return
    const medir = () => {
      const medido = Math.round(nodo.getBoundingClientRect().width)
      if (medido > 0) setAncho(medido)
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  return { referencia, ancho }
}
