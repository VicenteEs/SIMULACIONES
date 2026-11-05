'use client'

import React, { useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import { ImagenConCarga } from '@/components/ui/ImagenConCarga'
import type { CapaDelCuerpo } from './capitulos'
import type { FotoParaPintar } from './fotos'
import { esElFinDeLaBarra, prefiereMenosMovimiento, useEnPantalla, useMenosMovimiento } from './rotacion'

const ORDEN: readonly CapaDelCuerpo[] = ['piel', 'musculo', 'hueso']
const NOMBRE: Record<CapaDelCuerpo, string> = { piel: 'Piel', musculo: 'Músculo', hueso: 'Hueso' }

/** Cada cuánto pasa sola a la capa siguiente: los tres segundos que pidió el dueño (D-273). */
const INTERVALO_MS = 3000

/**
 * El abanico del capítulo Estudia: el cuerpo en una capa al frente y las otras
 * dos detrás, a los lados, y un selector para cambiar cuál va delante.
 *
 * Gira solo cada tres segundos (D-273), con una barra fina en la capa activa
 * que dice cuánto falta, y con las mismas reglas que el carrusel de «El
 * problema» (`rotacion.ts`): quieto mientras no se ve o con el puntero
 * encima, y parado del todo en cuanto alguien elige una capa o entra con el
 * teclado. Volver a girar mientras alguien mira la capa que eligió sería
 * quitársela de delante; y si girara con el foco dentro, el foco se quedaría
 * en un botón que ya no es el elegido. Con «reducir movimiento» no gira.
 *
 * El selector es un grupo de botones de opción (`radiogroup`) y no tres
 * botones sueltos: es una elección de una entre tres, y así el teclado hace lo
 * que cualquier grupo de opciones —una sola parada de tabulador y las flechas
 * para moverse—. Las capas de detrás también se pueden pulsar con el ratón,
 * pero no son paradas de tabulador: serían tres formas de hacer lo mismo para
 * quien navega con el teclado.
 *
 * Penpot dibujaba una cuarta capa, «Vasos», que aquí no está: no hay captura
 * de los vasos, y un botón que no cambia nada es peor que no tenerlo.
 */
export function CapasDelCuerpo({ capas }: { capas: Record<CapaDelCuerpo, FotoParaPintar> }) {
  const [activa, setActiva] = useState<CapaDelCuerpo>('musculo')
  const [detenida, setDetenida] = useState(false)
  const [encima, setEncima] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const botones = useRef<Partial<Record<CapaDelCuerpo, HTMLButtonElement | null>>>({})
  const menos = useMenosMovimiento()
  const enPantalla = useEnPantalla(raiz)

  const rota = !menos && !detenida
  const corriendo = rota && enPantalla && !encima

  const i = ORDEN.indexOf(activa)
  // La de la izquierda es la anterior en el orden piel → músculo → hueso y la
  // de la derecha, la siguiente, dando la vuelta: el abanico rota.
  const lugar = (capa: CapaDelCuerpo) => {
    const j = ORDEN.indexOf(capa)
    if (j === i) return 'frente'
    return j === (i + 1) % ORDEN.length ? 'derecha' : 'izquierda'
  }

  const elegir = (capa: CapaDelCuerpo) => {
    setDetenida(true)
    setActiva(capa)
  }

  const alTerminarLaBarra = (e: React.AnimationEvent<HTMLElement>) => {
    if (!esElFinDeLaBarra(e) || prefiereMenosMovimiento()) return
    setActiva(ORDEN[(i + 1) % ORDEN.length])
  }

  const alPulsarTecla = (e: React.KeyboardEvent) => {
    const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    const destino =
      e.key === 'Home' ? ORDEN[0] : e.key === 'End' ? ORDEN[ORDEN.length - 1] : paso ? ORDEN[(i + paso + ORDEN.length) % ORDEN.length] : null
    if (!destino) return
    e.preventDefault()
    elegir(destino)
    botones.current[destino]?.focus()
  }

  return (
    <div
      ref={raiz}
      className="p-capas"
      data-quieto={corriendo ? undefined : ''}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setEncima(true)
      }}
      onPointerLeave={() => setEncima(false)}
      onFocus={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && e.target.matches(':focus-visible')) setDetenida(true)
      }}
    >
      <div className="p-capas-escena">
        <span className="p-capas-plano" aria-hidden="true">
          <span>Plano axial</span>
        </span>
        {ORDEN.map((capa) => {
          const foto = capas[capa]
          const sitio = lugar(capa)
          return (
            <div
              key={capa}
              className="p-capas-figura"
              data-lugar={sitio}
              aria-hidden={sitio !== 'frente'}
              onClick={sitio === 'frente' ? undefined : () => elegir(capa)}
            >
              <ImagenConCarga
                src={foto.src}
                respaldo={foto.respaldo}
                alt={foto.alt}
                ancho={foto.ancho}
                alto={foto.alto}
                sizes="(max-width: 900px) 60vw, 300px"
              />
            </div>
          )
        })}
      </div>

      <div className="p-capas-selector" role="radiogroup" aria-label="Capa del cuerpo que se ve al frente" onKeyDown={alPulsarTecla}>
        {ORDEN.map((capa) => (
          <button
            key={capa}
            ref={(nodo) => {
              botones.current[capa] = nodo
            }}
            type="button"
            role="radio"
            aria-checked={capa === activa}
            tabIndex={capa === activa ? 0 : -1}
            onClick={() => elegir(capa)}
          >
            {capa === activa ? <Eye size={15} aria-hidden /> : null}
            {NOMBRE[capa]}
            {/* Una barra nueva por capa: al montarse arranca de cero. */}
            {capa === activa && rota ? (
              <span
                className="p-capas-progreso"
                aria-hidden="true"
                style={{ animationDuration: `${INTERVALO_MS}ms` }}
                onAnimationEnd={alTerminarLaBarra}
              />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
