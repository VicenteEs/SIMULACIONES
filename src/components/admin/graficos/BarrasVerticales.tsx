'use client'

import React from 'react'
import { cifra } from '@/lib/graficos'
import { useRecorrido } from './interaccion'
import { SinDatos, TablaAccesible } from './piezas'

export interface Punto {
  etiqueta: string
  valor: number
  /** Etiqueta larga para el globo y la tabla, si la corta no basta. */
  detalle?: string
}

/**
 * Barras verticales: series temporales cortas, como los últimos doce meses.
 *
 * Eran un SVG con `preserveAspectRatio="none"`, que estiraba el dibujo al
 * ancho de la tarjeta: las esquinas redondeadas salían ovaladas y la línea
 * base engordaba o adelgazaba según la pantalla. Ahora cada barra es un
 * bloque con su alto en porcentaje, sobre una rejilla de cuartos, y al pasar
 * el ratón enseña su cifra en un globo.
 *
 * «O al llegar con el tabulador», decía este comentario, y no era verdad: la
 * rejilla iba entera con `aria-hidden` y ninguna columna se podía enfocar. Desde
 * P-007 el gráfico es de cliente y se recorre como los demás (`interaccion.ts`):
 * una parada de tabulador, las flechas mueven el globo y una región viva dice
 * la cifra.
 */
export function BarrasVerticales({
  datos,
  titulo,
  altura = 140,
}: {
  datos: Punto[]
  titulo: string
  altura?: number
}) {
  const { activo, setActivo, propiedades } = useRecorrido(datos.length)
  if (datos.length === 0) return <SinDatos />

  const tope = Math.max(1, ...datos.map((d) => d.valor))
  const nombreDe = (p: Punto) => p.detalle ?? p.etiqueta

  return (
    <figure className="grafico grafico-interactivo">
      <figcaption className="sr-only">{titulo}</figcaption>
      <div
        className="grafico-columnas-foco"
        {...propiedades}
        role="group"
        aria-label={`${titulo}. Use las flechas para recorrer las barras.`}
      >
        <div className="grafico-columnas" style={{ height: altura }} aria-hidden>
          {datos.map((punto, i) => (
            <span
              key={`${punto.etiqueta}-${i}`}
              className={`grafico-columna${activo === i ? ' grafico-columna-activa' : ''}`}
              onPointerEnter={() => setActivo(i)}
              onPointerLeave={() => setActivo(null)}
            >
              <span
                className={`grafico-columna-barra${punto.valor === 0 ? ' grafico-columna-barra-cero' : ''}`}
                style={{ height: `${(punto.valor / tope) * 100}%` }}
              />
              <span className="grafico-globo">
                {nombreDe(punto)}: <strong>{cifra(punto.valor)}</strong>
              </span>
            </span>
          ))}
        </div>

        <div className="grafico-ejes" aria-hidden>
          {datos.map((punto, i) => (
            <span key={`${punto.etiqueta}-${i}`} className="grafico-eje">
              <span className="grafico-eje-valor">{cifra(punto.valor)}</span>
              <span className="grafico-eje-etiqueta">{punto.etiqueta}</span>
            </span>
          ))}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {activo !== null && datos[activo] ? `${nombreDe(datos[activo])}: ${cifra(datos[activo].valor)}` : ''}
      </p>

      <TablaAccesible
        titulo={titulo}
        columnas={['Periodo', 'Valor']}
        filas={datos.map((p) => [nombreDe(p), p.valor])}
      />
    </figure>
  )
}
