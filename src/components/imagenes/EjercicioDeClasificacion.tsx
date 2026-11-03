'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, CircleCheck, CircleX, Lightbulb, Lock, RotateCcw } from 'lucide-react'
import type { EjercicioDeClasificacion as Ejercicio, TipoAO } from '@/lib/clasificacionAO'

/**
 * Proponer una clasificación y compararla con la del caso, como el tablero de
 * Penpot (P-007 E4, D-237): «Lo que se ve», «Tu clasificación», «Comparar».
 *
 * Solo sale cuando el código del caso dice su tipo («23-A2», no «23» a secas):
 * sin respuesta no hay nada con qué comparar, y la página se queda como era
 * (`ejercicioDeClasificacion` decide). El nivel es el tipo A, B o C, que es lo
 * que se lee en una placa sin el compendio en la mano; el grupo queda a la
 * vista al comparar, en el código completo.
 *
 * Las opciones de manejo llegan como `children` y se abren después de
 * comparar: primero se piensa, después se mira. Van montadas desde el
 * principio, escondidas con `hidden`, porque en papel salen siempre.
 *
 * Lo propuesto no se guarda: es un ejercicio de la sesión, no una nota. Si un
 * día se quiere medir cuánto aciertan los residentes, aquí es donde se anota.
 */
export function EjercicioDeClasificacion({
  ejercicio,
  codigo,
  confianza,
  children,
}: {
  ejercicio: Ejercicio
  /** El código completo del caso, que se enseña al comparar. */
  codigo: string
  confianza: number | null
  /** Las opciones de manejo, ya pintadas. */
  children: ReactNode
}) {
  const [elegido, setElegido] = useState<TipoAO | null>(null)
  const [conPista, setConPista] = useState(false)
  const [comparado, setComparado] = useState(false)
  const resultado = useRef<HTMLHeadingElement>(null)

  const propuesto = ejercicio.tipos.find((t) => t.tipo === elegido)
  const correcto = ejercicio.tipos.find((t) => t.tipo === ejercicio.correcto)
  const acierto = elegido === ejercicio.correcto

  function comparar() {
    if (!elegido) return
    setComparado(true)
    // Al resultado, para que el lector de pantalla lo lea: el formulario que
    // tenía el foco acaba de desaparecer.
    requestAnimationFrame(() => resultado.current?.focus())
  }

  function otraVez() {
    setElegido(null)
    setConPista(false)
    setComparado(false)
  }

  const paso = comparado ? 3 : 2

  return (
    <div className="ejercicio">
      <ol className="ejercicio-pasos" aria-label="Pasos del ejercicio">
        {['Lo que se ve', 'Tu clasificación', 'Comparar'].map((texto, i) => {
          const numero = i + 1
          const estado = numero < paso ? 'hecho' : numero === paso ? 'actual' : 'pendiente'
          return (
            <li key={texto} data-estado={estado} aria-current={estado === 'actual' ? 'step' : undefined}>
              <span className="ejercicio-pasos-marca" aria-hidden="true">
                {estado === 'hecho' ? <Check size={14} strokeWidth={3} /> : numero}
              </span>
              {texto}
            </li>
          )
        })}
      </ol>

      {comparado && propuesto && correcto ? (
        <section className="ejercicio-tarjeta ejercicio-resultado" data-acierto={acierto ? '' : undefined}>
          <h2 ref={resultado} tabIndex={-1}>
            {acierto ? <CircleCheck size={22} aria-hidden="true" /> : <CircleX size={22} aria-hidden="true" />}
            {acierto ? 'Coincide con la clasificación del caso' : 'No coincide con la clasificación del caso'}
          </h2>
          <dl>
            <dt>Tu propuesta</dt>
            <dd>
              {ejercicio.segmento}-{propuesto.tipo} · {propuesto.nombre}
            </dd>
            <dt>La del caso</dt>
            <dd>
              <span className="codigo">{codigo}</span> · {correcto.nombre}
              {confianza !== null ? <span className="ejercicio-confianza">Confianza declarada: {confianza} %</span> : null}
            </dd>
          </dl>
          {!acierto ? <p className="ejercicio-explicacion">{correcto.descripcion}.</p> : null}
          <button type="button" className="boton boton-fantasma boton-sm" onClick={otraVez}>
            <RotateCcw size={16} aria-hidden="true" />
            Volver a intentarlo
          </button>
        </section>
      ) : (
        <section className="ejercicio-tarjeta">
          <fieldset className="ejercicio-opciones">
            <legend>
              <span className="ejercicio-pregunta">¿Qué clasificación propones?</span>
              <span className="ejercicio-segmento">
                {ejercicio.nombreDelSegmento} · AO/OTA {ejercicio.segmento}
              </span>
            </legend>
            {ejercicio.tipos.map((t) => (
              // Un `<input type="radio">` de verdad dentro de su `<label>`:
              // las flechas del teclado ya recorren el grupo y el lector de
              // pantalla dice «1 de 3» sin que haya que escribirlo.
              <label key={t.tipo} className="ejercicio-tipo">
                <input
                  type="radio"
                  name="tipo-propuesto"
                  value={t.tipo}
                  checked={elegido === t.tipo}
                  onChange={() => setElegido(t.tipo)}
                />
                <span>
                  <strong>
                    {t.tipo} · {t.nombre}
                  </strong>
                  <span>{t.descripcion}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {conPista ? (
            <p className="ejercicio-pista">
              <Lightbulb size={16} aria-hidden="true" />
              {ejercicio.pista}
            </p>
          ) : null}
          <div className="ejercicio-acciones">
            {!conPista ? (
              <button type="button" className="boton boton-fantasma" onClick={() => setConPista(true)}>
                <Lightbulb size={18} aria-hidden="true" />
                Pedir una pista
              </button>
            ) : null}
            {/* Apagado hasta elegir, con el motivo dicho al lado: un botón que
                no hace nada al pulsarlo se lee como una avería. */}
            <button type="button" className="boton" onClick={comparar} disabled={!elegido} aria-describedby={!elegido ? 'sin-eleccion' : undefined}>
              Comparar
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            {!elegido ? (
              <span id="sin-eleccion" className="ejercicio-ayuda">
                Elige un tipo para comparar.
              </span>
            ) : null}
          </div>
        </section>
      )}

      {!comparado ? (
        <div className="ejercicio-tarjeta ejercicio-cerrado">
          <h2>
            <Lock size={18} aria-hidden="true" />
            Opciones de manejo
          </h2>
          <p>Se abren cuando propones una clasificación: primero piensas, después comparas.</p>
        </div>
      ) : null}
      <div className="ejercicio-manejo" hidden={!comparado}>
        {children}
      </div>

      {/* En papel no hay ejercicio que hacer: sale la clasificación del caso,
          que en pantalla se guarda hasta comparar. */}
      <p className="ejercicio-en-papel">
        Clasificación del caso: {codigo} · {correcto?.nombre}
        {confianza !== null ? ` (confianza declarada: ${confianza} %)` : ''}
      </p>
    </div>
  )
}
