'use client'

import React from 'react'
import {
  evaluarGesto,
  fuerzaInicial,
  RESULTADOS,
  type PasoQuirurgico,
} from '@/lib/simulador'

/**
 * Interfaz del simulador quirúrgico.
 *
 * Toda la lógica de evaluación vive en `@/lib/simulador`, probada aparte. Aquí
 * solo se recoge lo que el estudiante elige y se muestra lo que ocurre.
 */
export function Simulador({ pasos, instrumentos }: { pasos: PasoQuirurgico[]; instrumentos: string[] }) {
  const [indice, setIndice] = React.useState(0)
  const [instrumento, setInstrumento] = React.useState<string | null>(null)
  const [fuerza, setFuerza] = React.useState(() => fuerzaInicial(pasos[0] ?? {}))
  const [registro, setRegistro] = React.useState<{ texto: string; clase: string }[]>([])
  const [complicaciones, setComplicaciones] = React.useState(0)
  const [fallos, setFallos] = React.useState(0)

  const terminado = indice >= pasos.length
  const paso = pasos[indice]

  function ejecutar() {
    if (!paso) return
    const r = evaluarGesto(paso, { instrumento, fuerza })

    const clase =
      r.resultado === RESULTADOS.CORRECTO
        ? 'bien'
        : r.complicacion
          ? 'grave'
          : 'aviso'

    setRegistro((prev) => [{ texto: `${indice + 1}. ${r.mensaje}`, clase }, ...prev].slice(0, 8))

    if (r.complicacion) setComplicaciones((n) => n + 1)
    else if (!r.avanza && r.resultado !== RESULTADOS.SIN_INSTRUMENTO) setFallos((n) => n + 1)

    if (r.avanza) {
      const siguiente = indice + 1
      setIndice(siguiente)
      setInstrumento(null)
      if (pasos[siguiente]) setFuerza(fuerzaInicial(pasos[siguiente]))
    }
  }

  function reiniciar() {
    setIndice(0)
    setInstrumento(null)
    setFuerza(fuerzaInicial(pasos[0] ?? {}))
    setRegistro([])
    setComplicaciones(0)
    setFallos(0)
  }

  return (
    <div className="simulador">
      <div className="simulador-principal">
        {terminado ? (
          <div className="tarjeta">
            <h2>Cirugía completada</h2>
            <p>
              {complicaciones === 0
                ? 'Sin complicaciones: todos los gestos usaron el instrumento correcto y se mantuvieron dentro del rango de fuerza útil.'
                : `Revise en el registro los pasos donde se excedió el rango de fuerza: cada uno corresponde a una complicación evitable. Complicaciones: ${complicaciones}.`}
            </p>
            <button type="button" className="boton" onClick={reiniciar}>
              Reiniciar la simulación
            </button>
          </div>
        ) : (
          <>
            <span className="paso-numero">
              Paso {indice + 1} de {pasos.length}
            </span>
            <h2>{paso?.titulo}</h2>
            {paso?.riesgo ? (
              <aside className="advertencia atencion">
                <span className="advertencia-etiqueta">Estructura o principio en juego</span>
                <p>{paso.riesgo}</p>
              </aside>
            ) : null}

            <fieldset className="campo">
              <legend>Instrumental</legend>
              <div className="instrumentos">
                {instrumentos.map((i) => (
                  <button
                    key={i}
                    type="button"
                    className={`instrumento ${instrumento === i ? 'elegido' : ''}`}
                    onClick={() => setInstrumento(i)}
                    aria-pressed={instrumento === i}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="campo">
              <legend>Fuerza aplicada: {fuerza} N</legend>
              <input
                type="range"
                min={0}
                max={80}
                value={fuerza}
                onChange={(e) => setFuerza(Number(e.target.value))}
                aria-label="Fuerza aplicada en newtons"
              />
              <p className="pista">
                Cada gesto tiene un rango útil. Por debajo la maniobra no se completa; por encima se
                produce una complicación.
              </p>
            </fieldset>

            <button type="button" className="boton" onClick={ejecutar}>
              Ejecutar el paso
            </button>
          </>
        )}
      </div>

      <aside className="simulador-registro">
        <h3>Registro quirúrgico</h3>
        <div className="marcadores">
          <span className="marcador grave">Complicaciones: {complicaciones}</span>
          <span className="marcador aviso">Maniobras fallidas: {fallos}</span>
        </div>
        {registro.length === 0 ? (
          <p className="vacio">Sin acciones registradas.</p>
        ) : (
          <ul className="registro">
            {registro.map((l, i) => (
              <li key={i} className={l.clase}>
                {l.texto}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
