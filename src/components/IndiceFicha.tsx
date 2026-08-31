'use client'

import React from 'react'

/**
 * Índice lateral de una ficha.
 *
 * Marca la pestaña que se está leyendo a medida que se desplaza la página. Se
 * usa IntersectionObserver en lugar de escuchar el evento de desplazamiento:
 * el navegador avisa solo cuando una sección entra o sale de la vista, sin
 * ejecutar código en cada píxel movido.
 */
export function IndiceFicha({ pestanas }: { pestanas: { campo: string; etiqueta: string }[] }) {
  const [activa, setActiva] = React.useState(pestanas[0]?.campo ?? '')

  React.useEffect(() => {
    if (pestanas.length === 0) return

    const observador = new IntersectionObserver(
      (entradas) => {
        // De todas las secciones visibles se toma la más alta, que es la que el
        // lector tiene realmente delante.
        const visibles = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visibles[0]) setActiva(visibles[0].target.id)
      },
      // El margen superior descuenta la barra fija; el inferior evita que una
      // sección muy larga marque a la siguiente antes de tiempo.
      { rootMargin: '-80px 0px -55% 0px', threshold: 0 },
    )

    for (const p of pestanas) {
      const elemento = document.getElementById(p.campo)
      if (elemento) observador.observe(elemento)
    }

    return () => observador.disconnect()
  }, [pestanas])

  if (pestanas.length < 2) return null

  return (
    <nav className="indice-ficha" aria-label="Secciones de la ficha">
      <span className="indice-titulo">En esta ficha</span>
      <ul>
        {pestanas.map((p) => (
          <li key={p.campo}>
            <a
              href={`#${p.campo}`}
              className={activa === p.campo ? 'activa' : ''}
              aria-current={activa === p.campo ? 'true' : undefined}
            >
              {p.etiqueta}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
