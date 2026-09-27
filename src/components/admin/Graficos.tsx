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

/**
 * Barras horizontales: comparar categorías con nombre largo.
 *
 * `destacar` pinta en el color de alerta las barras que lo cumplen y les pone
 * la bandera delante del nombre: el color no va solo, como pide cualquier
 * señal de estado (D-142: el ritmo de revisión por encima de lo que se lee).
 * `formato` escribe el valor, si no basta el número tal cual.
 */
export function BarrasHorizontales({
  datos,
  titulo,
  destacar,
  formato,
}: {
  datos: Punto[]
  titulo: string
  destacar?: (punto: Punto) => boolean
  formato?: (valor: number) => string
}) {
  if (datos.length === 0) return <p className="grafico-vacio">Sin datos todavía.</p>
  const tope = maximo(datos)

  return (
    <div className="grafico-lista" role="img" aria-label={titulo}>
      {datos.map((punto) => {
        const destacado = destacar?.(punto) ?? false
        return (
          <div className="grafico-fila" key={punto.etiqueta}>
            <span className="grafico-fila-etiqueta" title={punto.detalle ?? punto.etiqueta}>
              {destacado ? '⚑ ' : ''}
              {punto.etiqueta}
            </span>
            <span className="grafico-fila-barra">
              <span
                className={`grafico-fila-relleno${destacado ? ' grafico-fila-relleno-alerta' : ''}`}
                style={{ width: `${(punto.valor / tope) * 100}%` }}
              />
            </span>
            <span className="grafico-fila-valor">{formato ? formato(punto.valor) : punto.valor}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Varias barras apiladas, una por fila, con la leyenda común debajo.
 *
 * Para repartos que se comparan entre sí —el estado de la revisión en cada
 * módulo (D-142)—. Cada fila mide su total contra el de la mayor: un módulo con
 * el doble de fichas se ve el doble de largo, y dentro de cada una se lee la
 * proporción. Entre segmento y segmento, dos píxeles de fondo en vez de un
 * borde. La leyenda lleva el total de cada serie, y cada segmento su cifra al
 * pasar el ratón; las cifras exactas, además, están en las tablas de la página.
 */
export function BarrasApiladasPorFila({
  filas,
  series,
  titulo,
}: {
  filas: { etiqueta: string; valores: number[] }[]
  series: { etiqueta: string; color: string }[]
  titulo: string
}) {
  const totales = filas.map((f) => f.valores.reduce((t, v) => t + v, 0))
  const tope = Math.max(1, ...totales)
  if (totales.every((t) => t === 0)) return <p className="grafico-vacio">Sin datos todavía.</p>

  return (
    <div className="grafico-lista" role="img" aria-label={titulo}>
      {filas.map((fila, i) => (
        <div className="grafico-fila" key={fila.etiqueta}>
          <span className="grafico-fila-etiqueta" title={fila.etiqueta}>
            {fila.etiqueta}
          </span>
          <span className="grafico-fila-barra grafico-fila-apilada">
            <span style={{ width: `${(totales[i] / tope) * 100}%` }}>
              {fila.valores.map((valor, s) =>
                valor > 0 ? (
                  <span
                    key={series[s]?.etiqueta ?? s}
                    className="grafico-apilada-parte"
                    style={{ flex: valor, background: series[s]?.color }}
                    title={`${fila.etiqueta} · ${series[s]?.etiqueta}: ${valor}`}
                  />
                ) : null,
              )}
            </span>
          </span>
          <span className="grafico-fila-valor">{totales[i]}</span>
        </div>
      ))}
      <ul className="grafico-leyenda grafico-leyenda-en-fila">
        {series.map((serie, s) => (
          <li key={serie.etiqueta}>
            <span className="grafico-punto" style={{ background: serie.color }} />
            {serie.etiqueta}
            <strong>{filas.reduce((t, f) => t + (f.valores[s] ?? 0), 0)}</strong>
          </li>
        ))}
      </ul>
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
