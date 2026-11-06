'use client'

import { useEffect, useId, useState } from 'react'
import { X } from 'lucide-react'
import { EL_PLANO, HILOS_DEL_CIERRE, hiloDelCierre, type PlanoQueSeCierra } from '@/lib/cierreDeUnClic'
import type { HiloDeSutura } from '@/lib/sutura'

/**
 * El cuadro «Cerrar la herida» (P-013, pedido 16 de Cristóbal): «Pondría algo como "cerrar fascia" y que permita elegir el
 * hilo y su diámetro y pinchar la fascia y que quede toda cerrada [...] Elegir el hilo "nylon, monocryl, corchetes" y que al
 * pinchar la piel, que quede cerrado».
 *
 * Una fila por plano, de lo profundo a lo superficial, con su hilo y su calibre. «Cerrar» no cierra todavía: arma el cierre, y
 * es el clic sobre ese plano en el paciente el que lo cierra entero (\`cerrarElPlanoDeUnClic\` en el lienzo). Así se sigue
 * aprendiendo dónde está cada plano, que es lo que enseña el cierre por planos, sin coser punto por punto lo que ya se sabe
 * coser. El cuadro no tapa el centro del lienzo: va abajo a la izquierda, porque el clic que cierra es sobre la herida.
 *
 * El subcutáneo no tiene fila: en estos modelos la grasa va pegada a la piel (P-012 E8) y se cierra con ella. Se dice en el
 * propio cuadro, para que nadie lo busque.
 */

export interface EstadoDelPlanoQueSeCierra {
  plano: PlanoQueSeCierra
  /** El plano tiene herida: sin ella no hay nada que cerrar. */
  conHerida: boolean
  /** Cuánto está cerrada su herida, de 0 a 1. */
  cierre: number
}

const NOMBRE_DE_LA_FILA: Readonly<Record<PlanoQueSeCierra, string>> = { fascia: 'Fascia', piel: 'Piel' }

/** Lo que se ofrece primero en cada plano: el hilo habitual con su calibre habitual. */
const ELECCION_INICIAL: Readonly<Record<PlanoQueSeCierra, { clave: string; calibre: string | null }>> = {
  fascia: { clave: 'vicryl', calibre: '2-0' },
  piel: { clave: 'nylon', calibre: '3-0' },
}

export function CuadroDelCierre({
  planos,
  armado,
  alArmar,
  alReabrir,
  alCerrar,
}: {
  planos: readonly EstadoDelPlanoQueSeCierra[]
  /** El plano cuyo cierre está armado, esperando el clic sobre el paciente. */
  armado: PlanoQueSeCierra | null
  alArmar: (plano: PlanoQueSeCierra, hilo: HiloDeSutura) => void
  /** Quita lo cosido en ese plano: la herida vuelve a abrirse, por si se cerró antes de tiempo. */
  alReabrir: (plano: PlanoQueSeCierra) => void
  alCerrar: () => void
}) {
  const base = useId()
  const [eleccion, setEleccion] = useState(ELECCION_INICIAL)
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [alCerrar])

  return (
    <div className="consola-cuadro-cierre" role="dialog" aria-labelledby={`${base}-titulo`}>
      <div className="consola-cuadro-reduccion-cabecera">
        <strong id={`${base}-titulo`}>Cerrar la herida por planos</strong>
        <button type="button" className="consola-plegar" aria-label="Cerrar el cuadro" onClick={alCerrar}>
          <X size={14} aria-hidden />
        </button>
      </div>
      <p className="consola-cuadro-cierre-ayuda">
        De lo profundo a lo superficial. Elija el hilo, pulse «Cerrar» y pique sobre ese plano en el paciente: queda cerrado
        entero.
      </p>
      {planos.map(({ plano, conHerida, cierre }) => {
        const familias = HILOS_DEL_CIERRE[plano]
        const elegida = eleccion[plano]
        const familia = familias.find((f) => f.clave === elegida.clave) ?? familias[0]
        const calibre = elegida.calibre && familia.calibres.includes(elegida.calibre) ? elegida.calibre : familia.calibrePorDefecto
        const cerrado = conHerida && cierre >= 0.999
        const estado = !conHerida ? 'sin herida' : cerrado ? 'cerrada' : cierre > 0 ? `cerrada al ${Math.round(cierre * 100)} %` : 'abierta'
        return (
          <fieldset key={plano} className={`consola-cuadro-cierre-plano${armado === plano ? ' armado' : ''}`}>
            <legend>
              {NOMBRE_DE_LA_FILA[plano]} <span className="consola-cuadro-cierre-estado">· {estado}</span>
            </legend>
            <div className="consola-cuadro-cierre-hilos" role="radiogroup" aria-label={`Hilo para ${EL_PLANO[plano]}`}>
              {familias.map((f) => (
                <button
                  key={f.clave}
                  type="button"
                  role="radio"
                  aria-checked={f.clave === familia.clave}
                  className={`consola-cuadro-cierre-hilo${f.clave === familia.clave ? ' elegido' : ''}`}
                  title={f.descripcion}
                  onClick={() => setEleccion((antes) => ({ ...antes, [plano]: { clave: f.clave, calibre: f.calibrePorDefecto } }))}
                >
                  {f.nombre}
                </button>
              ))}
            </div>
            {familia.calibres.length > 0 ? (
              <label className="consola-cuadro-cierre-calibre">
                <span>Calibre</span>
                <select
                  value={calibre ?? ''}
                  onChange={(e) => setEleccion((antes) => ({ ...antes, [plano]: { clave: familia.clave, calibre: e.target.value } }))}
                >
                  {familia.calibres.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <p className="consola-cuadro-cierre-descripcion">{familia.descripcion}</p>
            <div className="consola-instrumento-acciones">
              <button
                type="button"
                className="consola-aplicar"
                disabled={!conHerida}
                aria-pressed={armado === plano}
                onClick={() => {
                  const hilo = hiloDelCierre(plano, familia.clave, calibre)
                  if (hilo) alArmar(plano, hilo)
                }}
              >
                {armado === plano ? `Pique sobre ${EL_PLANO[plano]}…` : `Cerrar ${EL_PLANO[plano]}`}
              </button>
              {cierre > 0 ? (
                <button type="button" className="consola-boton" onClick={() => alReabrir(plano)}>
                  Quitar el cierre
                </button>
              ) : null}
            </div>
          </fieldset>
        )
      })}
      <p className="consola-cuadro-cierre-nota">
        El tejido subcutáneo no tiene fila: en estos modelos la grasa va pegada a la piel, y se cierra con ella.
      </p>
    </div>
  )
}
