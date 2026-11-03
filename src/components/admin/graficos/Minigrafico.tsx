import React from 'react'
import { escalaLineal, posicionesX, trazoDeArea, trazoDeLinea } from '@/lib/graficos'

/**
 * La línea pequeña de una tarjeta de cifra: hacia dónde va, sin ejes (P-007 E1).
 *
 * Es adorno de una cifra que ya se lee en grande al lado, así que va oculta al
 * lector de pantalla; lo que diga de la tendencia lo dice `descripcion`, en
 * texto. Tamaño fijo y de servidor: no responde al ratón porque no tiene nada
 * que añadir a la cifra que acompaña.
 */
export function Minigrafico({
  valores,
  color = 'var(--marca)',
  ancho = 96,
  alto = 30,
  descripcion,
}: {
  valores: number[]
  color?: string
  ancho?: number
  alto?: number
  /** «Sube en las últimas cuatro semanas»: lo que el dibujo cuenta, dicho. */
  descripcion?: string
}) {
  if (valores.length < 2) return null
  const tope = Math.max(1, ...valores)
  const y = escalaLineal([0, tope], [alto - 2, 2])
  const xs = posicionesX(valores.length, 1, ancho - 1)
  const puntos = valores.map((v, i) => ({ x: xs[i], y: y(v) }))

  return (
    <span className="minigrafico">
      {/* Sin proporción fija y con el trazo que no escala: la tarjeta de cifra
          lo estrecha cuando no cabe (`.kpi-cuerpo`), y así se estrecha la
          línea sin que el trazo se vuelva una cinta. */}
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" aria-hidden>
        <path className="minigrafico-area" d={trazoDeArea(puntos, alto)} style={{ fill: color }} />
        <path className="minigrafico-linea" d={trazoDeLinea(puntos)} style={{ stroke: color }} vectorEffect="non-scaling-stroke" />
      </svg>
      {descripcion ? <span className="sr-only">{descripcion}</span> : null}
    </span>
  )
}
