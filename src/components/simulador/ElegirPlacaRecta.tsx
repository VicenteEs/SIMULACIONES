'use client'

import { useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import {
  AGUJEROS_MAXIMOS,
  AGUJEROS_MINIMOS,
  NOMBRE_DEL_AGUJERO,
  idDeLaPlacaRecta,
  largoEscritoMm,
  placaRectaDelId,
  placasConAgujeros,
} from '@/lib/placasRectas'

const conComa = (mm: number) => String(Math.round(mm * 10) / 10).replace('.', ',')
const CANTIDADES = Array.from({ length: AGUJEROS_MAXIMOS - AGUJEROS_MINIMOS + 1 }, (_, k) => AGUJEROS_MINIMOS + k)

/**
 * El pedido de una placa recta a medida (P-008 E3): cuántos agujeros y, si se quiere, qué largo; debajo, todas las
 * placas de esa cantidad —una por sistema, cada una con su tornillo y su forma de agujero—, y pinchar una la pone en la
 * mano. Es lo que pidió el dueño: «colocar 5 cm y 3 agujeros y que aparezca eso y no otro», y «si coloca 5 agujeros, que
 * salgan todas las de esa cantidad con distintas medidas de agujero».
 *
 * Arranca con la placa que se tiene en la mano, si es a medida: pasar de 5 a 6 agujeros es tocar «+» y elegir otra
 * vez, sin volver a escribir el largo. Los sistemas que no dan el largo pedido no desaparecen: se quedan al final, en
 * gris, con el largo entre el que sí salen, para que se vea por qué no están.
 */
export function ElegirPlacaRecta({ enLaMano, alElegir }: { enLaMano: string | null; alElegir: (id: string) => void }) {
  const actual = placaRectaDelId(enLaMano)
  const [agujeros, setAgujeros] = useState(actual?.agujeros ?? 5)
  const [largo, setLargo] = useState(actual && actual.pasoMm !== actual.sistema.pasoMm ? `${conComa(actual.largoMm)} mm` : '')
  const largoMm = largo.trim() === '' ? null : largoEscritoMm(largo)
  const largoIlegible = largo.trim() !== '' && largoMm === null
  const ofertas = placasConAgujeros(agujeros, largoIlegible ? null : largoMm)
  const cambiar = (n: number) => setAgujeros(Math.min(AGUJEROS_MAXIMOS, Math.max(AGUJEROS_MINIMOS, n)))

  return (
    <div className="placa-a-medida" role="group" aria-label="Placa recta a medida">
      <p className="placa-a-medida-titulo">Placa recta a medida</p>
      <div className="placa-a-medida-campos">
        <div className="placa-a-medida-campo">
          <span id="placa-a-medida-agujeros">Agujeros</span>
          <div className="placa-a-medida-contador">
            <button type="button" className="consola-boton consola-boton-icono" aria-label="Un agujero menos" disabled={agujeros <= AGUJEROS_MINIMOS} onClick={() => cambiar(agujeros - 1)}>
              <Minus size={14} aria-hidden />
            </button>
            {/* Una lista y no un campo de número: al borrar para escribir «12», el campo valía 0 un instante y saltaba a 2. */}
            <select value={agujeros} aria-labelledby="placa-a-medida-agujeros" onChange={(e) => cambiar(Number(e.target.value))}>
              {CANTIDADES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button type="button" className="consola-boton consola-boton-icono" aria-label="Un agujero más" disabled={agujeros >= AGUJEROS_MAXIMOS} onClick={() => cambiar(agujeros + 1)}>
              <Plus size={14} aria-hidden />
            </button>
          </div>
        </div>
        <label className="placa-a-medida-campo">
          <span>Largo</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="el de catálogo, o p. ej. 5 cm"
            value={largo}
            aria-invalid={largoIlegible}
            onChange={(e) => setLargo(e.target.value)}
          />
        </label>
      </div>
      {largoIlegible ? <p className="placa-a-medida-aviso">Escriba el largo en milímetros («50») o en centímetros («5 cm»).</p> : null}
      <ul className="placa-a-medida-lista">
        {ofertas.map((o) => {
          if (!o.placa) {
            return (
              <li key={o.sistema.id} className="placa-a-medida-no-da">
                <span className="placa-a-medida-nombre">{o.sistema.nombre}</span>
                <span className="placa-a-medida-datos">
                  con {agujeros} agujeros sale de {conComa(o.rangoMm[0])} a {conComa(o.rangoMm[1])} mm
                </span>
              </li>
            )
          }
          const id = idDeLaPlacaRecta(o.placa)
          const elegida = id === enLaMano
          const deCatalogo = o.placa.pasoMm === o.sistema.pasoMm
          return (
            <li key={o.sistema.id}>
              <button type="button" className={`placa-a-medida-opcion${elegida ? ' activo' : ''}`} aria-pressed={elegida} onClick={() => alElegir(id)}>
                <span className="placa-a-medida-nombre">
                  {o.sistema.nombre}
                  {elegida ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
                </span>
                <span className="placa-a-medida-datos u-num">
                  {conComa(o.placa.largoMm)} mm · tornillo {conComa(o.sistema.tornilloMm)} · {NOMBRE_DEL_AGUJERO[o.sistema.agujero]} · cada{' '}
                  {conComa(o.placa.pasoMm)} mm{deCatalogo ? '' : ` (de catálogo, ${conComa(o.sistema.pasoMm)})`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
