'use client'

import React, { useState, type KeyboardEvent } from 'react'
import { cifra, escalonDeIntensidad } from '@/lib/graficos'
import { SinDatos, TablaAccesible } from './piezas'

const ESCALONES = 4

/**
 * Un mapa de calor de filas por columnas: cuándo se estudia, día por hora
 * (P-007 E1).
 *
 * Cada celda va en uno de cuatro tonos del marino según su valor contra el
 * máximo (`escalonDeIntensidad`), con la leyenda «menos · más» debajo. Se
 * recorre con las cuatro flechas como una tabla: izquierda y derecha cambian de
 * columna, arriba y abajo de fila. Una sola parada de tabulador, por lo mismo
 * que el resto de los gráficos (`interaccion.ts`).
 */
export function MapaDeCalor({
  titulo,
  filas,
  columnas,
  valores,
  unidad = '',
  cadaCuantasColumnas = 2,
}: {
  titulo: string
  /** El nombre de cada fila: «lun», «mar»… */
  filas: string[]
  /** El nombre de cada columna: «0», «1»… «23». */
  columnas: string[]
  /** `valores[fila][columna]`. */
  valores: number[][]
  unidad?: string
  /** Cada cuántas columnas se escribe su nombre debajo. */
  cadaCuantasColumnas?: number
}) {
  const [activa, setActiva] = useState<{ f: number; c: number } | null>(null)
  const maximo = Math.max(0, ...valores.flat())
  if (filas.length === 0 || columnas.length === 0 || maximo === 0) return <SinDatos />

  const escribir = (v: number) => `${cifra(v)}${unidad ? ` ${unidad}` : ''}`
  const nombreDe = (f: number, c: number) => `${filas[f]} · ${columnas[c]}`

  const alTeclear = (evento: KeyboardEvent) => {
    const { f, c } = activa ?? { f: 0, c: 0 }
    const mover: Record<string, [number, number]> = {
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    }
    if (evento.key === 'Escape') return setActiva(null)
    const paso = mover[evento.key]
    if (!paso) return
    evento.preventDefault()
    if (!activa) return setActiva({ f: 0, c: 0 })
    setActiva({
      f: Math.min(filas.length - 1, Math.max(0, f + paso[0])),
      c: Math.min(columnas.length - 1, Math.max(0, c + paso[1])),
    })
  }

  return (
    <figure className="grafico grafico-interactivo grafico-calor">
      <figcaption className="sr-only">{titulo}</figcaption>
      <div
        className="grafico-calor-cuerpo"
        tabIndex={0}
        role="group"
        aria-label={`${titulo}. Use las flechas para recorrer las celdas.`}
        onKeyDown={alTeclear}
        onBlur={() => setActiva(null)}
      >
        <div
          className="grafico-calor-rejilla"
          style={{ gridTemplateColumns: `auto repeat(${columnas.length}, minmax(0, 1fr))` }}
          aria-hidden
        >
          {filas.map((fila, f) => (
            <React.Fragment key={fila}>
              <span className="grafico-calor-fila">{fila}</span>
              {columnas.map((columna, c) => {
                const valor = valores[f]?.[c] ?? 0
                const marcada = activa?.f === f && activa?.c === c
                return (
                  <span
                    key={columna}
                    className={`grafico-calor-celda grafico-calor-${escalonDeIntensidad(valor, maximo, ESCALONES)}${marcada ? ' grafico-calor-marcada' : ''}`}
                    onPointerEnter={() => setActiva({ f, c })}
                    onPointerLeave={() => setActiva(null)}
                  >
                    {marcada ? (
                      <span className="grafico-globo grafico-globo-visible">
                        {nombreDe(f, c)}: <strong>{escribir(valor)}</strong>
                      </span>
                    ) : null}
                  </span>
                )
              })}
            </React.Fragment>
          ))}
          <span />
          {columnas.map((columna, c) => (
            <span key={columna} className="grafico-calor-columna">
              {c % cadaCuantasColumnas === 0 ? columna : ''}
            </span>
          ))}
        </div>

        <div className="grafico-calor-leyenda" aria-hidden>
          menos
          {Array.from({ length: ESCALONES + 1 }, (_, i) => (
            <span key={i} className={`grafico-calor-celda grafico-calor-${i}`} />
          ))}
          más
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {activa ? `${nombreDe(activa.f, activa.c)}: ${escribir(valores[activa.f]?.[activa.c] ?? 0)}` : ''}
      </p>

      <TablaAccesible
        titulo={titulo}
        columnas={['', ...columnas]}
        filas={filas.map((fila, f) => [fila, ...columnas.map((_, c) => escribir(valores[f]?.[c] ?? 0))])}
      />
    </figure>
  )
}
