import React from 'react'
import { Flag } from 'lucide-react'
import { SinDatos, TablaAccesible } from './graficos/piezas'
import type { Punto } from './graficos/BarrasVerticales'
import type { Umbral } from './graficos/Lineas'

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
 *
 * Desde P-007 hay además líneas con área, donas, mapa de calor y minigráficos,
 * en `graficos/`: los que responden al ratón y al teclado son de cliente, y su
 * aritmética —ejes, trazos, arcos— vive aparte en `src/lib/graficos.ts`, que es
 * lo que la suite puede probar. Este archivo los reexporta para que una página
 * los pida a todos al mismo sitio. Las barras verticales se mudaron allí por lo
 * mismo: ahora se recorren con las flechas.
 */

export type { Punto } from './graficos/BarrasVerticales'
export { BarrasVerticales } from './graficos/BarrasVerticales'
export { Lineas, type SerieDeLineas, type Umbral } from './graficos/Lineas'
export { Dona, type ParteDeDona } from './graficos/Dona'
export { MapaDeCalor } from './graficos/MapaDeCalor'
export { Minigrafico } from './graficos/Minigrafico'
export { SinDatos, NoSePudoLeer } from './graficos/piezas'

const maximo = (datos: Punto[]) => Math.max(1, ...datos.map((d) => d.valor))

/**
 * Barras horizontales: comparar categorías con nombre largo.
 *
 * `destacar` pinta en el color de alerta las barras que lo cumplen y les pone
 * la bandera delante del nombre: el color no va solo, como pide cualquier
 * señal de estado (D-142: el ritmo de revisión por encima de lo que se lee).
 * `formato` escribe el valor, si no basta el número tal cual.
 *
 * `umbral` dibuja una raya vertical que cruza todas las filas, con su rótulo
 * (P-007): las palabras por minuto al validar llevan la de 250, por encima de
 * la cual es difícil haber leído con atención (D-142). Sin ella, la bandera
 * decía que una barra se pasaba pero no de qué. Si el umbral queda por encima
 * de la barra más larga, la escala se estira hasta él, para que se vea.
 */
export function BarrasHorizontales({
  datos,
  titulo,
  destacar,
  formato,
  umbral,
}: {
  datos: Punto[]
  titulo: string
  destacar?: (punto: Punto) => boolean
  formato?: (valor: number) => string
  umbral?: Umbral
}) {
  if (datos.length === 0) return <SinDatos />
  const tope = Math.max(maximo(datos), umbral?.valor ?? 0)
  const escribir = (v: number) => (formato ? formato(v) : String(v))

  return (
    <figure className="grafico">
      <figcaption className="sr-only">{titulo}</figcaption>
      <div
        className={`grafico-lista${umbral ? ' grafico-lista-con-umbral' : ''}`}
        style={umbral ? ({ '--umbral': `${(umbral.valor / tope) * 100}%` } as React.CSSProperties) : undefined}
        aria-hidden
      >
        {/* El rótulo va en una fila más, con las mismas columnas que las
            barras, para que quede justo encima de la raya. La raya la pinta
            cada barra en su `::after` (`panel.css`): un trazo que cruzara la
            lista entera tendría que saber dónde empieza la columna de las
            barras, que depende del nombre más largo. */}
        {umbral ? (
          <div className="grafico-fila grafico-umbral-fila">
            <span />
            <span className="grafico-umbral-pista">
              <span className="grafico-umbral-rotulo">{umbral.etiqueta}</span>
            </span>
            <span />
          </div>
        ) : null}
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
