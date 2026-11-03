import React from 'react'

/**
 * Las piezas que comparten todos los gráficos del panel: el aviso de «sin
 * datos», el de «no se pudo leer» y la tabla que lee el lector de pantalla.
 *
 * Salieron de `Graficos.tsx` cuando llegaron los gráficos interactivos de
 * P-007 (líneas, dona, mapa de calor), para que los nuevos y los de siempre
 * digan lo mismo con las mismas palabras: un gráfico vacío que en una tarjeta
 * dice «Sin datos todavía» y en la de al lado no dice nada parece roto.
 */

export function SinDatos({ texto = 'Sin datos todavía.' }: { texto?: string }) {
  return <p className="grafico-vacio">{texto}</p>
}

/**
 * Lo que se pinta cuando la consulta falló, en lugar del gráfico.
 *
 * No es lo mismo que «sin datos» y no se puede decir igual: un cero que es en
 * realidad un error de lectura es la mentira que `estadisticas/page.tsx` se
 * toma el trabajo de no contar (`noSePudoLeer`).
 */
export function NoSePudoLeer({ que }: { que: string }) {
  return (
    <p className="grafico-vacio grafico-vacio-error" role="status">
      No se pudo leer {que}. Vuelva a cargar la página en unos minutos.
    </p>
  )
}

/**
 * La tabla que lee el lector de pantalla en lugar del dibujo.
 *
 * Oculta dentro de un `div.sr-only` y no con la clase sobre la propia tabla:
 * una tabla no se estrecha por debajo de lo que ocupa su contenido, así que el
 * `width: 1px` no la encogía y, posicionada en absoluto, la de treinta días del
 * Resumen ensanchaba la página 275 px en el teléfono (D-238). El `div` sí se
 * queda en un píxel y recorta lo que lleva dentro.
 */
export function TablaAccesible({
  titulo,
  columnas,
  filas,
}: {
  titulo: string
  columnas: string[]
  filas: (string | number)[][]
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{titulo}</caption>
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th key={`${c}-${i}`} scope="col">
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
    </div>
  )
}
