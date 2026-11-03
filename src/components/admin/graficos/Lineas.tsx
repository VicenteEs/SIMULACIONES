'use client'

import React, { useState } from 'react'
import {
  cifra,
  escalaLineal,
  indiceMasCercano,
  marcasDelEje,
  posicionesX,
  trazoDeArea,
  trazoDeLinea,
} from '@/lib/graficos'
import { useAncho, useRecorrido } from './interaccion'
import { SinDatos, TablaAccesible } from './piezas'

export interface SerieDeLineas {
  etiqueta: string
  /** Un color de la paleta como variable: `var(--mod-1)`, `var(--marca)`. */
  color: string
  valores: number[]
}

/** Lo que se pinta encima de las series: una meta, un umbral, un tope. */
export interface Umbral {
  valor: number
  etiqueta: string
}

const MARGEN = { arriba: 12, derecha: 12, abajo: 26, izquierda: 40 }
/** Cuántas etiquetas del eje horizontal caben sin pisarse, como mucho. */
const ETIQUETAS_VISIBLES = 8
/**
 * Lo que ocupa una etiqueta del eje («28 oct») con aire a los lados. Con ocho
 * fijas, en el teléfono quedaban a 35 px unas de otras y se leían de corrido
 * «5 oct 9 oct 13 oct»; ahora caben las que caben en el ancho de verdad.
 */
const ANCHO_DE_ETIQUETA = 56

/**
 * Líneas con área, una o varias series sobre el mismo eje (P-007 E1).
 *
 * Para lo que evoluciona en el tiempo y se compara: lecturas por día de
 * residentes frente a docentes, fichas que entran y salen de la cola. Al pasar
 * el ratón, o al recorrerlo con las flechas, una línea vertical marca el punto y
 * un globo da las cifras de todas las series en ese momento. La leyenda son
 * botones que apagan y encienden cada serie, porque con dos curvas que se
 * cruzan a veces hace falta mirar una sola.
 *
 * `unidad` y `decimales` en lugar de una función de formato: este componente es
 * de cliente y las páginas del panel son de servidor, que no le pueden pasar
 * funciones.
 */
export function Lineas({
  titulo,
  etiquetas,
  series,
  detalles,
  altura = 200,
  umbral,
  area = true,
  unidad = '',
  decimales = 0,
}: {
  titulo: string
  /** La etiqueta corta de cada punto, la que va en el eje: «5 oct», «s41». */
  etiquetas: string[]
  series: SerieDeLineas[]
  /** La etiqueta larga de cada punto para el globo y la tabla, si la corta no basta. */
  detalles?: string[]
  altura?: number
  umbral?: Umbral
  area?: boolean
  unidad?: string
  decimales?: number
}) {
  const { referencia, ancho } = useAncho<HTMLDivElement>()
  const [apagadas, setApagadas] = useState<string[]>([])
  const { activo, setActivo, propiedades } = useRecorrido(etiquetas.length)

  const visibles = series.filter((s) => !apagadas.includes(s.etiqueta))
  const escribir = (v: number) => `${cifra(v, decimales)}${unidad ? ` ${unidad}` : ''}`

  const hayDatos = etiquetas.length > 0 && series.some((s) => s.valores.some((v) => v > 0))
  if (!hayDatos) return <SinDatos />

  // Sin `useMemo`: son unas decenas de puntos, y `visibles` es una lista nueva
  // en cada pintada, así que la memoria se habría rehecho igual cada vez.
  const tope = Math.max(0, umbral?.valor ?? 0, ...visibles.flatMap((s) => s.valores))
  const marcas = marcasDelEje(tope, 4, decimales === 0)
  const techo = marcas[marcas.length - 1] || 1
  const y = escalaLineal([0, techo], [altura - MARGEN.abajo, MARGEN.arriba])
  const xs = posicionesX(etiquetas.length, MARGEN.izquierda, Math.max(MARGEN.izquierda + 1, ancho - MARGEN.derecha))
  const base = altura - MARGEN.abajo
  const caben = Math.max(2, Math.min(ETIQUETAS_VISIBLES, Math.floor((ancho - MARGEN.izquierda - MARGEN.derecha) / ANCHO_DE_ETIQUETA)))
  const cada = Math.max(1, Math.ceil(etiquetas.length / caben))
  const nombreDe = (i: number) => detalles?.[i] ?? etiquetas[i]

  const alternar = (etiqueta: string) =>
    setApagadas((antes) => {
      if (antes.includes(etiqueta)) return antes.filter((e) => e !== etiqueta)
      // La última serie encendida no se apaga: un gráfico vacío no enseña
      // nada y obliga a adivinar qué botón lo devuelve.
      if (series.length - antes.length <= 1) return antes
      return [...antes, etiqueta]
    })

  const alMover = (evento: React.PointerEvent<SVGSVGElement>) => {
    const caja = evento.currentTarget.getBoundingClientRect()
    setActivo(indiceMasCercano(xs, evento.clientX - caja.left))
  }

  // El globo se ancla al punto y se da la vuelta en la mitad derecha, para que
  // el último mes no salga cortado por el borde de la tarjeta.
  const globo =
    activo !== null && xs[activo] !== undefined ? (
      <div
        className={`grafico-globo-flotante${xs[activo] > ancho / 2 ? ' grafico-globo-izquierda' : ''}`}
        style={{ left: xs[activo] }}
        aria-hidden
      >
        <strong>{nombreDe(activo)}</strong>
        {visibles.map((s) => (
          <span key={s.etiqueta}>
            <span className="grafico-punto" style={{ background: s.color }} />
            {s.etiqueta}: <b>{escribir(s.valores[activo] ?? 0)}</b>
          </span>
        ))}
      </div>
    ) : null

  return (
    <figure className="grafico grafico-interactivo">
      <figcaption className="sr-only">{titulo}</figcaption>
      {series.length > 1 ? (
        <div className="grafico-leyenda-botones" role="group" aria-label={`Series de «${titulo}»`}>
          {series.map((s) => {
            const encendida = !apagadas.includes(s.etiqueta)
            return (
              <button
                key={s.etiqueta}
                type="button"
                className="grafico-leyenda-boton"
                aria-pressed={encendida}
                onClick={() => alternar(s.etiqueta)}
              >
                <span className="grafico-punto" style={{ background: encendida ? s.color : 'transparent', borderColor: s.color }} />
                {s.etiqueta}
              </button>
            )
          })}
        </div>
      ) : null}

      <div
        ref={referencia}
        className="grafico-lienzo"
        {...propiedades}
        aria-label={`${titulo}. Use las flechas para recorrer los puntos.`}
        role="group"
      >
        <svg
          className="grafico-svg"
          width={ancho}
          height={altura}
          viewBox={`0 0 ${ancho} ${altura}`}
          aria-hidden
          onPointerMove={alMover}
          onPointerLeave={() => setActivo(null)}
        >
          {marcas.map((marca) => (
            <g key={marca} className="grafico-rejilla">
              <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y(marca)} y2={y(marca)} />
              <text x={MARGEN.izquierda - 6} y={y(marca)} dy="0.32em" textAnchor="end">
                {cifra(marca)}
              </text>
            </g>
          ))}

          {/* Se cuentan desde el final: el último punto —hoy, este mes— siempre
              lleva su etiqueta y las demás quedan a la misma distancia. Contadas
              desde el principio y forzando la última, con treinta días la última
              caía pegada a la penúltima y se leía «1 no2 nov» (D-238). */}
          {etiquetas.map((etiqueta, i) =>
            (etiquetas.length - 1 - i) % cada === 0 ? (
              <text key={`${etiqueta}-${i}`} className="grafico-eje-x" x={xs[i]} y={altura - 8} textAnchor="middle">
                {etiqueta}
              </text>
            ) : null,
          )}

          {visibles.map((s) => {
            const puntos = s.valores.map((v, i) => ({ x: xs[i], y: y(v) }))
            return (
              <g key={s.etiqueta}>
                {area && visibles.length <= 2 ? (
                  <path className="grafico-area" d={trazoDeArea(puntos, base)} style={{ fill: s.color }} />
                ) : null}
                <path className="grafico-linea" d={trazoDeLinea(puntos)} style={{ stroke: s.color }} />
              </g>
            )
          })}

          {umbral ? (
            <g className="grafico-umbral">
              <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y(umbral.valor)} y2={y(umbral.valor)} />
              <text x={ancho - MARGEN.derecha} y={y(umbral.valor) - 5} textAnchor="end">
                {umbral.etiqueta}
              </text>
            </g>
          ) : null}

          {activo !== null && xs[activo] !== undefined ? (
            <g className="grafico-cursor">
              <line x1={xs[activo]} x2={xs[activo]} y1={MARGEN.arriba} y2={base} />
              {visibles.map((s) => (
                <circle key={s.etiqueta} cx={xs[activo]} cy={y(s.valores[activo] ?? 0)} r={4} style={{ stroke: s.color }} />
              ))}
            </g>
          ) : null}
        </svg>
        {globo}
      </div>

      {/* Lo que dice la región viva al recorrer con el teclado. Fuera del
          lienzo, que lleva el foco: dentro, algunos lectores lo repiten dos
          veces. */}
      <p className="sr-only" aria-live="polite">
        {activo !== null
          ? `${nombreDe(activo)}: ${visibles.map((s) => `${s.etiqueta} ${escribir(s.valores[activo] ?? 0)}`).join(', ')}`
          : ''}
      </p>

      <TablaAccesible
        titulo={titulo}
        columnas={['Periodo', ...series.map((s) => s.etiqueta)]}
        filas={etiquetas.map((_, i) => [nombreDe(i), ...series.map((s) => escribir(s.valores[i] ?? 0))])}
      />
    </figure>
  )
}
