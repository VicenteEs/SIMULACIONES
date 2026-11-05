'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { esElFinDeLaBarra, prefiereMenosMovimiento, useEnPantalla, useMenosMovimiento } from './rotacion'

export interface TarjetaDelProblema {
  antes: string
  /** Vacío, la frase de «con TraumaHub» hace de título, como antes de las tarjetas. */
  titulo: string
  con: string
  puntos: readonly string[]
  icono: React.ReactNode
}

/**
 * Lo que dura cada tarjeta. El dueño pidió «cada X segundos»: siete dan para
 * leer un título, una frase y tres puntos sin que la tarjeta se vaya a media
 * lectura. Las capas de Estudia cambian cada tres, pero allí no hay nada que
 * leer.
 */
const INTERVALO_MS = 7000
const DESLIZ_MS = 750
/** La curva suave de la portada (`--p-curva-suave`): arranca rápido y se posa. */
const CURVA = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** Lo que hay que arrastrar el dedo para pasar de tarjeta; con menos, bajar por la página en diagonal las pasaba sin querer. */
const ARRASTRE_MINIMO = 48
const HUECO_ENTRE_TARJETAS = 32

/** Fuera de la ventana, del lado que toca, con un hueco para que no se vean pegadas al cruzarse. */
const fuera = (lado: 1 | -1) => `translateX(calc(${lado * 100}% ${lado > 0 ? '+' : '-'} ${HUECO_ENTRE_TARJETAS}px))`

/**
 * «El problema» en tarjetas que pasan solas (D-272).
 *
 * Las tarjetas están apiladas en la misma celda de la rejilla y solo la actual
 * es visible: así la ventana mide lo que la más alta y no salta de alto al
 * cambiar. El desliz lo hace la API de animaciones y no una tira con
 * `translateX(-i × 100 %)`: con la tira, pasar de la última a la primera
 * rebobinaba las tres de golpe; aquí la que entra viene siempre del lado hacia
 * el que se avanza, también al dar la vuelta.
 *
 * Gira solo mientras está a la vista, se detiene con el puntero encima, y deja
 * de girar en cuanto alguien elige una tarjeta, entra con el teclado o pulsa
 * pausa (WCAG 2.2.2 pide poder pararlo, y el patrón de carrusel de WAI-ARIA,
 * que no vuelva a arrancar sin que se pida). Con «reducir movimiento» no gira
 * ni desliza: se cambia con los mandos y nada más.
 *
 * Las que no se ven van con `inert`: ni el tabulador ni el lector de pantalla
 * entran en una tarjeta que no está.
 */
export function CarruselDelProblema({ tarjetas }: { tarjetas: readonly TarjetaDelProblema[] }) {
  const cuantas = tarjetas.length
  const [actual, setActual] = useState(0)
  const [detenido, setDetenido] = useState(false)
  const [encima, setEncima] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const nodos = useRef<(HTMLElement | null)[]>([])
  const puntos = useRef<(HTMLButtonElement | null)[]>([])
  const previa = useRef(0)
  const sentido = useRef<1 | -1>(1)
  const toque = useRef<{ x: number; y: number } | null>(null)
  const menos = useMenosMovimiento()
  const enPantalla = useEnPantalla(raiz)

  const rota = cuantas > 1 && !menos && !detenido
  const corriendo = rota && enPantalla && !encima

  const ir = (destino: number, hacia: 1 | -1) => {
    sentido.current = hacia
    setActual(((destino % cuantas) + cuantas) % cuantas)
  }
  // Quien usa los mandos se queda con la tarjeta que eligió: volver a girar
  // mientras la lee sería quitársela de delante.
  const elegir = (destino: number, hacia: 1 | -1) => {
    setDetenido(true)
    ir(destino, hacia)
  }

  useEffect(() => {
    const desde = previa.current
    previa.current = actual
    if (desde === actual || prefiereMenosMovimiento()) return
    const entra = nodos.current[actual]
    const sale = nodos.current[desde]
    // Un clic durante el desliz anterior: se corta el que iba y se parte de
    // donde está cada una, en vez de sumar dos animaciones sobre la misma.
    for (const el of [entra, sale]) el?.getAnimations().forEach((a) => a.cancel())
    const lado = sentido.current
    const opciones: KeyframeAnimationOptions = { duration: DESLIZ_MS, easing: CURVA }
    entra?.animate([{ transform: fuera(lado), opacity: 0.35 }, { transform: 'none', opacity: 1 }], opciones)
    // La que sale ya no es la actual y su CSS la esconde: se la deja visible
    // mientras dura su salida, y al terminar vuelve sola a lo que dice el CSS.
    sale?.animate(
      [
        { transform: 'none', opacity: 1, visibility: 'visible' },
        { transform: fuera(lado === 1 ? -1 : 1), opacity: 0.35, visibility: 'visible' },
      ],
      opciones,
    )
  }, [actual])

  const alTerminarLaBarra = (e: React.AnimationEvent<HTMLElement>) => {
    if (!esElFinDeLaBarra(e) || prefiereMenosMovimiento()) return
    ir(actual + 1, 1)
  }

  const alPulsarTecla = (e: React.KeyboardEvent) => {
    const paso = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!paso) return
    e.preventDefault()
    const destino = (actual + paso + cuantas) % cuantas
    elegir(destino, paso as 1 | -1)
    puntos.current[destino]?.focus()
  }

  const titulo = (t: TarjetaDelProblema) => t.titulo || t.con

  return (
    <div
      ref={raiz}
      className="p-carrusel"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Qué cambia con TraumaHub"
      data-quieto={corriendo ? undefined : ''}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setEncima(true)
      }}
      onPointerLeave={() => setEncima(false)}
      onFocus={(e) => {
        // Al entrar con el teclado desde fuera, y solo entonces: el clic en un
        // mando ya detiene por su cuenta, y quien reanudó con el teclado y
        // sigue dentro no tiene por qué volver a pararlo al moverse.
        const desdeFuera = !e.currentTarget.contains(e.relatedTarget as Node | null)
        if (desdeFuera && e.target.matches(':focus-visible')) setDetenido(true)
      }}
    >
      <div
        className="p-carrusel-ventana"
        // Mientras gira solo no se anuncia cada cambio: el lector de pantalla
        // estaría leyendo tarjetas que nadie pidió.
        aria-live={rota ? 'off' : 'polite'}
        onPointerDown={(e) => {
          toque.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          const inicio = toque.current
          toque.current = null
          if (!inicio || cuantas < 2) return
          const dx = e.clientX - inicio.x
          const dy = e.clientY - inicio.y
          if (Math.abs(dx) < ARRASTRE_MINIMO || Math.abs(dx) < Math.abs(dy) * 1.5) return
          if (dx < 0) elegir(actual + 1, 1)
          else elegir(actual - 1, -1)
        }}
        onPointerCancel={() => {
          toque.current = null
        }}
      >
        {tarjetas.map((t, i) => (
          <article
            key={i}
            ref={(el) => {
              nodos.current[i] = el
            }}
            className="p-tarjeta-problema"
            role="group"
            aria-roledescription="tarjeta"
            aria-label={`${i + 1} de ${cuantas}: ${titulo(t)}`}
            data-actual={i === actual ? '' : undefined}
            inert={i !== actual}
          >
            {t.antes ? (
              <p className="p-problema-antes">
                <span className="p-rotulo-mono">Antes</span> <s>{t.antes}</s>
              </p>
            ) : null}
            <div className="p-tarjeta-problema-cabeza">
              <span className="p-icono-caja p-icono-caja-grande" aria-hidden="true">
                {t.icono}
              </span>
              <p>
                <span className="p-rotulo-mono">Con TraumaHub</span>
                <strong>{titulo(t)}</strong>
              </p>
            </div>
            {t.titulo && t.con ? <p className="p-tarjeta-problema-texto">{t.con}</p> : null}
            {t.puntos.length > 0 ? (
              <ul className="p-tarjeta-problema-puntos">
                {t.puntos.map((punto) => (
                  <li key={punto}>
                    <span className="p-tarjeta-problema-marca" aria-hidden="true">
                      <Check size={13} strokeWidth={3} />
                    </span>
                    {punto}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>

      {cuantas > 1 ? (
        <div className="p-carrusel-mandos">
          <div className="p-carrusel-mandos-grupo">
            {/* Primero en el orden del tabulador, como pide el patrón: quien
                llega con el teclado encuentra antes cómo pararlo. */}
            {menos ? null : (
              <button
                type="button"
                className="p-carrusel-boton"
                aria-label={detenido ? 'Reanudar el carrusel' : 'Pausar el carrusel'}
                onClick={() => setDetenido(!detenido)}
              >
                {detenido ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
              </button>
            )}
            <div className="p-carrusel-puntos" role="group" aria-label="Elegir tarjeta" onKeyDown={alPulsarTecla}>
              {tarjetas.map((t, i) => (
                <button
                  key={i}
                  ref={(el) => {
                    puntos.current[i] = el
                  }}
                  type="button"
                  className="p-carrusel-punto"
                  aria-label={`Tarjeta ${i + 1}: ${titulo(t)}`}
                  aria-current={i === actual ? 'true' : undefined}
                  data-lleno={i === actual && !rota ? '' : undefined}
                  onClick={() => {
                    if (i !== actual) elegir(i, i > actual ? 1 : -1)
                  }}
                >
                  <span className="p-carrusel-marca" aria-hidden="true">
                    {/* Una barra nueva por tarjeta: al montarse arranca de cero. */}
                    {i === actual && rota ? (
                      <span
                        className="p-carrusel-progreso"
                        style={{ animationDuration: `${INTERVALO_MS}ms` }}
                        onAnimationEnd={alTerminarLaBarra}
                      />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="p-carrusel-mandos-grupo">
            <button type="button" className="p-carrusel-boton" aria-label="Tarjeta anterior" onClick={() => elegir(actual - 1, -1)}>
              <ChevronLeft size={18} aria-hidden />
            </button>
            <button type="button" className="p-carrusel-boton" aria-label="Tarjeta siguiente" onClick={() => elegir(actual + 1, 1)}>
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
