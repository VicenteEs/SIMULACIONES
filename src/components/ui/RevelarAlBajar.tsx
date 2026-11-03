'use client'

import React, { useEffect, useRef } from 'react'

/**
 * Una sección de la portada que aparece al llegar a ella (P-007 E1).
 *
 * El servidor la pinta visible y así se queda si el JavaScript no llega: un
 * buscador, una vista previa sin guiones o un teléfono lento leen la página
 * entera. Solo al montarse, y solo si la sección está todavía por debajo de la
 * pantalla, se esconde para revelarla al bajar. Lo que ya está a la vista no se
 * toca: esconder lo que alguien está leyendo para volver a enseñárselo es justo
 * el parpadeo que esto quiere evitar.
 *
 * La marca va en `data-revelar` y no en `className` porque React reescribe la
 * clase cada vez que el padre cambia la suya, y se llevaría la marca por
 * delante; un atributo que React no pinta no lo toca nunca.
 *
 * Con «reducir movimiento» en el sistema no se esconde nada, además de la
 * regla global de `estilos.css` que acorta las transiciones.
 */
export function RevelarAlBajar({
  children,
  className,
  id,
}: {
  children: React.ReactNode
  className?: string
  /** Para las anclas de la barra («#capitulos»), que apuntan a la sección. */
  id?: string
}) {
  const referencia = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const nodo = referencia.current
    if (!nodo || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (nodo.getBoundingClientRect().top < window.innerHeight) return

    nodo.dataset.revelar = 'pendiente'
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return
        nodo.dataset.revelar = 'visto'
        observador.disconnect()
      },
      // Un poco antes del borde: que ya esté apareciendo cuando se mira.
      { rootMargin: '0px 0px -8% 0px' },
    )
    observador.observe(nodo)
    return () => {
      observador.disconnect()
      delete nodo.dataset.revelar
    }
  }, [])

  return (
    <div ref={referencia} id={id} className={className}>
      {children}
    </div>
  )
}
