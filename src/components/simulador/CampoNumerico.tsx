'use client'

import { useId, useState } from 'react'
import { acotar, numeroEscrito } from '@/lib/ejesAnatomicos'

const SIN_EFECTO = 'Ahí no se pudo: se queda donde estaba.'

/**
 * Un número que se escribe, con un botón a cada lado para empujarlo de a poco (P-004 E6, pedidos 2 y 5 de Cristóbal).
 *
 * Los deslizadores de la consola no dejaban llevar un valor exacto —«75 mm hacia distal»— ni pasar de un tope fijo.
 * Aquí se escribe la cifra y se confirma con Intro o al salir del campo; Esc la devuelve a lo que había. Lo escrito se
 * **acota** al rango en vez de rechazarse: pedir 500 donde el máximo es 315 deja 315 y lo dice.
 *
 * El texto en edición vive aquí; mientras no se edita, el campo muestra el valor que le llega de fuera, de modo que
 * lo que mueva otra cosa (la rueda, las flechas del teclado) se ve sin sincronizar nada.
 */
export function CampoNumerico({
  etiqueta,
  valor,
  minimo,
  maximo,
  paso = 1,
  unidad,
  alConfirmar,
  textoDelMenos,
  textoDelMas,
  pie,
  decimales = 0,
}: {
  etiqueta: string
  valor: number
  minimo: number
  maximo: number
  paso?: number
  unidad: string
  /** Aplica el valor; si devuelve `false` no se pudo (la placa no tiene hueso debajo) y el campo lo dice. */
  alConfirmar: (n: number) => boolean | void
  /** Lo que dice el botón de la izquierda (por ejemplo «Distal»): sin él, un menos. */
  textoDelMenos?: string
  textoDelMas?: string
  /** Una línea debajo del campo: «75 mm hacia distal». */
  pie?: string
  decimales?: number
}) {
  const id = useId()
  const [escrito, setEscrito] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const formato = (n: number) => n.toFixed(decimales).replace('.', ',')

  const confirmar = (texto: string) => {
    setEscrito(null)
    const n = numeroEscrito(texto)
    if (n === null) {
      setAviso('Escriba un número.')
      return
    }
    const acotado = acotar(n, minimo, maximo)
    const aviso = acotado !== n ? `El rango va de ${formato(minimo)} a ${formato(maximo)} ${unidad}: quedó en ${formato(acotado)}.` : null
    const hecho = acotado !== valor ? alConfirmar(acotado) : undefined
    setAviso(hecho === false ? SIN_EFECTO : aviso)
  }
  const empujar = (sentido: 1 | -1) => {
    setEscrito(null)
    const nuevo = acotar(Math.round((valor + sentido * paso) * 100) / 100, minimo, maximo)
    setAviso(nuevo !== valor && alConfirmar(nuevo) === false ? SIN_EFECTO : null)
  }

  return (
    <div className="consola-campo-numerico">
      <label className="consola-campo-numerico-etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <div className="consola-campo-numerico-fila">
        <button type="button" className="consola-boton" onClick={() => empujar(-1)} disabled={valor <= minimo} aria-label={`${textoDelMenos ?? 'Menos'}: ${etiqueta}`}>
          {textoDelMenos ?? '−'}
        </button>
        <input
          id={id}
          className="consola-campo-numerico-entrada u-num"
          type="text"
          inputMode="decimal"
          value={escrito ?? formato(valor)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setEscrito(e.target.value)}
          onBlur={(e) => {
            if (escrito !== null) confirmar(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              confirmar(e.currentTarget.value)
            } else if (e.key === 'Escape') {
              setEscrito(null)
              setAviso(null)
            }
          }}
        />
        <span className="consola-campo-numerico-unidad">{unidad}</span>
        <button type="button" className="consola-boton" onClick={() => empujar(1)} disabled={valor >= maximo} aria-label={`${textoDelMas ?? 'Más'}: ${etiqueta}`}>
          {textoDelMas ?? '+'}
        </button>
      </div>
      {pie ? <p className="consola-campo-numerico-pie">{pie}</p> : null}
      {aviso ? (
        <p className="consola-campo-numerico-aviso" role="status">
          {aviso}
        </p>
      ) : null}
    </div>
  )
}
