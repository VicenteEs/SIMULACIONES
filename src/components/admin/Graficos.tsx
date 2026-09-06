import React from 'react'

/**
 * Gráficos del panel, dibujados a mano en SVG.
 *
 * No hay librería de gráficos y no hace falta: son tres formas —barras
 * verticales, barras horizontales y un área— sobre datos de dos columnas. Una
 * dependencia de gráficos pesa más que todo el panel junto y traería su propio
 * sistema de colores, justo lo contrario de lo que persigue la plataforma.
 *
 * Cada gráfico va acompañado de sus cifras en texto, de modo que la información
 * está completa aunque el SVG no se vea: en una impresión, en un lector de
 * pantalla o en una pantalla estrecha.
 */

export interface Punto {
  etiqueta: string
  valor: number
  /** Etiqueta larga para el título accesible, si la corta no basta. */
  detalle?: string
}

const maximo = (datos: Punto[]) => Math.max(1, ...datos.map((d) => d.valor))

/** Barras verticales: series temporales cortas, como los últimos doce meses. */
export function BarrasVerticales({
  datos,
  titulo,
  altura = 140,
}: {
  datos: Punto[]
  titulo: string
  altura?: number
}) {
  if (datos.length === 0) return <p className="grafico-vacio">Sin datos todavía.</p>

  const tope = maximo(datos)
  const ancho = 100 / datos.length

  return (
    <figure className="grafico">
      <svg
        viewBox={`0 0 100 ${altura}`}
        preserveAspectRatio="none"
        className="grafico-svg"
        role="img"
        aria-label={titulo}
        style={{ height: altura }}
      >
        {datos.map((punto, i) => {
          const alto = (punto.valor / tope) * (altura - 18)
          return (
            <g key={`${punto.etiqueta}-${i}`}>
              <title>{`${punto.detalle ?? punto.etiqueta}: ${punto.valor}`}</title>
              <rect
                x={i * ancho + ancho * 0.18}
                y={altura - 14 - alto}
                width={ancho * 0.64}
                height={Math.max(alto, punto.valor > 0 ? 1.5 : 0)}
                rx="0.6"
                fill="var(--marca)"
                opacity={punto.valor === 0 ? 0.15 : 0.85}
              />
            </g>
          )
        })}
        <line x1="0" y1={altura - 14} x2="100" y2={altura - 14} stroke="var(--linea)" strokeWidth="0.4" />
      </svg>

      <div className="grafico-ejes">
        {datos.map((punto, i) => (
          <span key={`${punto.etiqueta}-${i}`} className="grafico-eje">
            <span className="grafico-eje-valor">{punto.valor}</span>
            <span className="grafico-eje-etiqueta">{punto.etiqueta}</span>
          </span>
        ))}
      </div>
    </figure>
  )
}

/** Barras horizontales: comparar categorías con nombre largo. */
export function BarrasHorizontales({ datos, titulo }: { datos: Punto[]; titulo: string }) {
  if (datos.length === 0) return <p className="grafico-vacio">Sin datos todavía.</p>
  const tope = maximo(datos)

  return (
    <div className="grafico-lista" role="img" aria-label={titulo}>
      {datos.map((punto) => (
        <div className="grafico-fila" key={punto.etiqueta}>
          <span className="grafico-fila-etiqueta" title={punto.detalle ?? punto.etiqueta}>
            {punto.etiqueta}
          </span>
          <span className="grafico-fila-barra">
            <span
              className="grafico-fila-relleno"
              style={{ width: `${(punto.valor / tope) * 100}%` }}
            />
          </span>
          <span className="grafico-fila-valor">{punto.valor}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Reparto en una sola barra apilada.
 *
 * Para un total que se divide en pocas partes —cuentas por rol, fichas
 * publicadas frente a borradores—, donde lo que importa es la proporción y no
 * la evolución.
 */
export function BarraApilada({
  partes,
  titulo,
}: {
  partes: { etiqueta: string; valor: number; color: string }[]
  titulo: string
}) {
  const total = partes.reduce((t, p) => t + p.valor, 0)
  if (total === 0) return <p className="grafico-vacio">Sin datos todavía.</p>

  return (
    <div className="grafico-apilada-caja" role="img" aria-label={titulo}>
      <div className="grafico-apilada">
        {partes
          .filter((p) => p.valor > 0)
          .map((parte) => (
            <span
              key={parte.etiqueta}
              className="grafico-apilada-parte"
              style={{ width: `${(parte.valor / total) * 100}%`, background: parte.color }}
              title={`${parte.etiqueta}: ${parte.valor}`}
            />
          ))}
      </div>
      <ul className="grafico-leyenda">
        {partes.map((parte) => (
          <li key={parte.etiqueta}>
            <span className="grafico-punto" style={{ background: parte.color }} />
            {parte.etiqueta}
            <strong>{parte.valor}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}
