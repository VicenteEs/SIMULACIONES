import React from 'react'
import { Flag } from 'lucide-react'

/**
 * Gráficos del panel, dibujados a mano en HTML.
 *
 * No hay librería de gráficos y no hace falta: son cuatro formas —barras
 * verticales, barras horizontales y dos repartos apilados— sobre datos de dos
 * columnas. Una dependencia de gráficos pesa más que todo el panel junto y
 * traería su propio sistema de colores, justo lo contrario de lo que persigue
 * la plataforma.
 *
 * Cada gráfico es un `<figure>` con su título en `<figcaption>` y sus cifras en
 * una tabla para lectores de pantalla (`sr-only`). Antes era un `role="img"`
 * con una etiqueta: el lector anunciaba «Lecturas por mes, imagen» y se
 * saltaba los doce números, que eran lo único que importaba. Las cifras
 * también se ven en pantalla, así que la información está completa aunque la
 * barra no se vea: en una impresión o en una pantalla estrecha.
 *
 * Los colores llegan como variables (`var(--tono-ok)`, `var(--marca)`), nunca
 * como hexadecimales: la paleta vive en las hojas y el mapa de tonos de
 * estado en `src/lib/tonosDeEstado.ts`, compartido con las insignias.
 */

export interface Punto {
  etiqueta: string
  valor: number
  /** Etiqueta larga para el globo y la tabla, si la corta no basta. */
  detalle?: string
}

const maximo = (datos: Punto[]) => Math.max(1, ...datos.map((d) => d.valor))

function SinDatos() {
  return <p className="grafico-vacio">Sin datos todavía.</p>
}

/** La tabla que lee el lector de pantalla en lugar del dibujo. */
function TablaAccesible({
  titulo,
  columnas,
  filas,
}: {
  titulo: string
  columnas: string[]
  filas: (string | number)[][]
}) {
  return (
    <table className="sr-only">
      <caption>{titulo}</caption>
      <thead>
        <tr>
          {columnas.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, i) => (
          <tr key={i}>
            {fila.map((celda, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {celda}
                </th>
              ) : (
                <td key={j}>{celda}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Barras verticales: series temporales cortas, como los últimos doce meses.
 *
 * Eran un SVG con `preserveAspectRatio="none"`, que estiraba el dibujo al
 * ancho de la tarjeta: las esquinas redondeadas salían ovaladas y la línea
 * base engordaba o adelgazaba según la pantalla. Ahora cada barra es un
 * bloque con su alto en porcentaje, sobre una rejilla de cuartos, y al pasar
 * el ratón —o al llegar con el tabulador— enseña su cifra en un globo.
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
  if (datos.length === 0) return <SinDatos />

  const tope = maximo(datos)

  return (
    <figure className="grafico">
      <figcaption className="sr-only">{titulo}</figcaption>
      <div className="grafico-columnas" style={{ height: altura }} aria-hidden>
        {datos.map((punto, i) => (
          <span key={`${punto.etiqueta}-${i}`} className="grafico-columna">
            <span
              className={`grafico-columna-barra${punto.valor === 0 ? ' grafico-columna-barra-cero' : ''}`}
              style={{ height: `${(punto.valor / tope) * 100}%` }}
            />
            <span className="grafico-globo">
              {punto.detalle ?? punto.etiqueta}: <strong>{punto.valor}</strong>
            </span>
          </span>
        ))}
      </div>

      <div className="grafico-ejes" aria-hidden>
        {datos.map((punto, i) => (
          <span key={`${punto.etiqueta}-${i}`} className="grafico-eje">
            <span className="grafico-eje-valor">{punto.valor}</span>
            <span className="grafico-eje-etiqueta">{punto.etiqueta}</span>
          </span>
        ))}
      </div>

      <TablaAccesible
        titulo={titulo}
        columnas={['Periodo', 'Valor']}
        filas={datos.map((p) => [p.detalle ?? p.etiqueta, p.valor])}
      />
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
  if (datos.length === 0) return <SinDatos />
  const tope = maximo(datos)
  const escribir = (v: number) => (formato ? formato(v) : String(v))

  return (
    <figure className="grafico">
      <figcaption className="sr-only">{titulo}</figcaption>
      <div className="grafico-lista" aria-hidden>
        {datos.map((punto) => {
          const destacado = destacar?.(punto) ?? false
          return (
            <div className="grafico-fila" key={punto.etiqueta} title={`${punto.detalle ?? punto.etiqueta}: ${escribir(punto.valor)}`}>
              <span className="grafico-fila-etiqueta">
                {destacado ? <Flag size={14} /> : null}
                <span>{punto.etiqueta}</span>
              </span>
              <span className="grafico-fila-barra">
                <span
                  className={`grafico-fila-relleno${destacado ? ' grafico-fila-relleno-alerta' : ''}`}
                  style={{ width: `${(punto.valor / tope) * 100}%` }}
                />
              </span>
              <span className="grafico-fila-valor">{escribir(punto.valor)}</span>
            </div>
          )
        })}
      </div>
      <TablaAccesible
        titulo={titulo}
        columnas={['Nombre', 'Valor', ...(destacar ? ['Señalado'] : [])]}
        filas={datos.map((p) => [
          p.detalle ?? p.etiqueta,
          escribir(p.valor),
          ...(destacar ? [destacar(p) ? 'sí' : 'no'] : []),
        ])}
      />
    </figure>
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
 * pasar el ratón; las cifras exactas, además, están en la tabla accesible.
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
  if (totales.every((t) => t === 0)) return <SinDatos />

  return (
    <figure className="grafico">
      <figcaption className="sr-only">{titulo}</figcaption>
      <div className="grafico-lista" aria-hidden>
        {filas.map((fila, i) => (
          <div className="grafico-fila" key={fila.etiqueta}>
            <span className="grafico-fila-etiqueta" title={fila.etiqueta}>
              <span>{fila.etiqueta}</span>
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
      <TablaAccesible
        titulo={titulo}
        columnas={['', ...series.map((s) => s.etiqueta), 'Total']}
        filas={filas.map((f, i) => [f.etiqueta, ...series.map((_, s) => f.valores[s] ?? 0), totales[i]])}
      />
    </figure>
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
  if (total === 0) return <SinDatos />

  return (
    <figure className="grafico grafico-apilada-caja">
      <figcaption className="sr-only">{titulo}</figcaption>
      <div aria-hidden>
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
      <TablaAccesible titulo={titulo} columnas={['Parte', 'Valor']} filas={partes.map((p) => [p.etiqueta, p.valor])} />
    </figure>
  )
}
