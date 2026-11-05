'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ChevronDown } from 'lucide-react'

/**
 * Una tarjeta de «Sobre nosotros», de alto fijo, con «Ver más» cuando su texto
 * no cabe (D-278).
 *
 * Todas miden lo mismo (el alto está en `portada.css`). Antes medían lo que su
 * texto, y en la columna angosta de la rejilla una descripción de seis
 * renglones escrita en la pestaña «Equipo» estiraba la tarjeta hasta unos
 * 1.000 px, al lado de la de Chesscore, de 290. Lo que no cabe se desvanece al
 * pie y se abre con el botón; abierta, la tarjeta mide lo que su texto y solo
 * empuja hacia abajo a las de las filas siguientes.
 *
 * Si el texto cabe no hay botón, y eso se sabe midiendo y no contando letras:
 * cuánto ocupa una descripción depende del ancho de la columna, del escalón de
 * letra de la portada y de si la fuente ya terminó de cargar. Se mide el
 * contenido contra la ventana que lo recorta, y otra vez cada vez que cambia el
 * tamaño de cualquiera de los dos (`ResizeObserver`): al llegar la fuente, al
 * girar el teléfono, al estrechar la ventana. Medir solo la ventana no basta,
 * porque su alto es fijo: lo que crece al llegar la fuente es el contenido.
 *
 * Antes de que llegue el JavaScript la tarjeta ya tiene su alto fijo, para que
 * nada salte al hidratar; el botón aparece al medir. Sin JavaScript no habría
 * cómo abrirla, y por eso `@media (scripting: none)` le devuelve su alto
 * natural.
 *
 * El lector de pantalla lee el texto entero aunque esté recortado: el recorte es
 * `overflow: hidden`, que no saca nada del árbol de accesibilidad. El botón es
 * para quien mira, y lleva el nombre de la tarjeta, oculto a la vista, para que
 * tres «Ver más» seguidos no suenen iguales.
 */
export function TarjetaDelEquipo({
  nombre,
  baja = false,
  children,
}: {
  nombre: string
  /** La de la columna derecha, que va un poco más abajo (D-277). */
  baja?: boolean
  // Opcional aunque siempre llegan: obligatorios, el tipo de `createElement`
  // los exige dentro de las props, y la regla `react/no-children-prop` del
  // lint prohíbe justo eso.
  children?: React.ReactNode
}) {
  const id = useId()
  const tarjeta = useRef<HTMLElement>(null)
  const ventana = useRef<HTMLDivElement>(null)
  const contenido = useRef<HTMLDivElement>(null)
  const [excede, setExcede] = useState(false)
  const [abierta, setAbierta] = useState(false)

  useEffect(() => {
    // Abierta no hay nada que medir: la ventana mide lo que el contenido. Se
    // vuelve a medir al cerrarla, por si entretanto la columna se ensanchó y
    // ahora cabe; entonces el botón se va.
    if (abierta) return
    const marco = ventana.current
    const texto = contenido.current
    if (!marco || !texto) return
    // Un píxel de holgura: los dos altos llegan redondeados, y el contenido que
    // cabe justo podía salir un píxel más alto que su ventana.
    const medir = () => setExcede(texto.offsetHeight > marco.clientHeight + 1)
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(medir)
    observador.observe(marco)
    observador.observe(texto)
    return () => observador.disconnect()
  }, [abierta])

  const alternar = () => {
    if (!abierta) {
      setAbierta(true)
      return
    }
    // Al cerrar, la tarjeta recupera su alto de golpe. Quien bajó leyendo hasta
    // el botón tenía el comienzo de la tarjeta por encima de la pantalla, y lo
    // que había debajo de ella subía a ocupar su sitio: se quedaba mirando la
    // sección siguiente. Se la trae de vuelta, debajo de la barra fija, que es lo
    // que descuenta `scroll-padding-top`. `flushSync` para medir ya cerrada.
    flushSync(() => setAbierta(false))
    const caja = tarjeta.current
    if (!caja) return
    const barra = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
    if (caja.getBoundingClientRect().top < barra) caja.scrollIntoView({ block: 'start' })
  }

  return (
    <article
      ref={tarjeta}
      className={baja ? 'p-tarjeta-equipo p-tarjeta-equipo-baja' : 'p-tarjeta-equipo'}
      data-recortada={excede && !abierta ? '' : undefined}
      data-abierta={abierta ? '' : undefined}
    >
      <div ref={ventana} id={id} className="p-tarjeta-ventana">
        <div ref={contenido}>{children}</div>
      </div>
      {excede || abierta ? (
        <button type="button" className="p-tarjeta-mas" aria-expanded={abierta} aria-controls={id} onClick={alternar}>
          {abierta ? 'Ver menos' : 'Ver más'}
          <span className="sr-only"> sobre {nombre}</span>
          <ChevronDown size={16} aria-hidden />
        </button>
      ) : null}
    </article>
  )
}
