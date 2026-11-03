'use client'

import React from 'react'
import { cifra, sectoresDeDona } from '@/lib/graficos'
import { useRecorrido } from './interaccion'
import { SinDatos, TablaAccesible } from './piezas'

export interface ParteDeDona {
  etiqueta: string
  valor: number
  color: string
}

const LADO = 156
const EXTERIOR = 74
const INTERIOR = 50

/**
 * Una dona con su leyenda: cómo se reparte un total en pocas partes (P-007 E1).
 *
 * Cuentas por rol, fichas por módulo, la cola por módulo. Hasta seis partes:
 * con más, los sectores finos no se distinguen y se lee mejor una barra
 * horizontal (`BarrasHorizontales`). El centro dice el total y, al pasar el
 * ratón por un sector o por su fila de la leyenda —o al recorrerla con las
 * flechas—, la cifra y el porcentaje de esa parte. El lado es fijo: una dona
 * que se estira con la tarjeta deja de ser redonda.
 */
export function Dona({
  titulo,
  partes,
  rotuloDelTotal,
}: {
  titulo: string
  partes: ParteDeDona[]
  /** Lo que va debajo del total, en el centro: «cuentas», «fichas». */
  rotuloDelTotal: string
}) {
  const visibles = partes.filter((p) => p.valor > 0)
  const { activo, setActivo, propiedades } = useRecorrido(visibles.length)
  const total = visibles.reduce((t, p) => t + p.valor, 0)
  if (total === 0) return <SinDatos />

  const sectores = sectoresDeDona(
    visibles.map((p) => p.valor),
    { cx: LADO / 2, cy: LADO / 2, exterior: EXTERIOR, interior: INTERIOR },
  )
  const porcentaje = (v: number) => `${Math.round((v / total) * 100)} %`
  const elegida = activo !== null ? visibles[activo] : null

  return (
    <figure className="grafico grafico-interactivo grafico-dona">
      <figcaption className="sr-only">{titulo}</figcaption>
      <div
        className="grafico-dona-cuerpo"
        {...propiedades}
        role="group"
        aria-label={`${titulo}. Use las flechas para recorrer las partes.`}
      >
        <svg width={LADO} height={LADO} viewBox={`0 0 ${LADO} ${LADO}`} aria-hidden className="grafico-dona-svg">
          {sectores.map((sector, i) =>
            sector.d ? (
              <path
                key={visibles[i].etiqueta}
                d={sector.d}
                className={`grafico-sector${activo !== null && activo !== i ? ' grafico-sector-atenuado' : ''}`}
                style={{ fill: visibles[i].color }}
                onPointerEnter={() => setActivo(i)}
                onPointerLeave={() => setActivo(null)}
              />
            ) : null,
          )}
          <text x={LADO / 2} y={LADO / 2 - 4} textAnchor="middle" className="grafico-dona-cifra">
            {cifra(elegida ? elegida.valor : total)}
          </text>
          <text x={LADO / 2} y={LADO / 2 + 15} textAnchor="middle" className="grafico-dona-rotulo">
            {elegida ? porcentaje(elegida.valor) : rotuloDelTotal}
          </text>
        </svg>

        <ul className="grafico-leyenda grafico-leyenda-dona" aria-hidden>
          {visibles.map((parte, i) => (
            <li
              key={parte.etiqueta}
              className={activo === i ? 'grafico-leyenda-activa' : undefined}
              onPointerEnter={() => setActivo(i)}
              onPointerLeave={() => setActivo(null)}
            >
              <span className="grafico-punto" style={{ background: parte.color }} />
              {parte.etiqueta}
              <strong>{cifra(parte.valor)}</strong>
            </li>
          ))}
        </ul>
      </div>

      <p className="sr-only" aria-live="polite">
        {elegida ? `${elegida.etiqueta}: ${cifra(elegida.valor)}, ${porcentaje(elegida.valor)} del total` : ''}
      </p>

      <TablaAccesible
        titulo={titulo}
        columnas={['Parte', 'Valor', 'Porcentaje']}
        filas={visibles.map((p) => [p.etiqueta, cifra(p.valor), porcentaje(p.valor)])}
      />
    </figure>
  )
}
