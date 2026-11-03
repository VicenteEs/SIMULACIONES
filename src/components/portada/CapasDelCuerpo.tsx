'use client'

import React, { useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import { ImagenConCarga } from '@/components/ui/ImagenConCarga'
import type { CapaDelCuerpo } from './capitulos'
import type { FotoParaPintar } from './fotos'

const ORDEN: readonly CapaDelCuerpo[] = ['piel', 'musculo', 'hueso']
const NOMBRE: Record<CapaDelCuerpo, string> = { piel: 'Piel', musculo: 'Músculo', hueso: 'Hueso' }

/**
 * El abanico del capítulo Estudia: el cuerpo en una capa al frente y las otras
 * dos detrás, a los lados, y un selector para cambiar cuál va delante.
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
  const botones = useRef<Partial<Record<CapaDelCuerpo, HTMLButtonElement | null>>>({})

  const i = ORDEN.indexOf(activa)
  // La de la izquierda es la anterior en el orden piel → músculo → hueso y la
  // de la derecha, la siguiente, dando la vuelta: el abanico rota.
  const lugar = (capa: CapaDelCuerpo) => {
    const j = ORDEN.indexOf(capa)
    if (j === i) return 'frente'
    return j === (i + 1) % ORDEN.length ? 'derecha' : 'izquierda'
  }

  const alPulsarTecla = (e: React.KeyboardEvent) => {
    const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    const destino =
      e.key === 'Home' ? ORDEN[0] : e.key === 'End' ? ORDEN[ORDEN.length - 1] : paso ? ORDEN[(i + paso + ORDEN.length) % ORDEN.length] : null
    if (!destino) return
    e.preventDefault()
    setActiva(destino)
    botones.current[destino]?.focus()
  }

  return (
    <div className="p-capas">
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
              onClick={sitio === 'frente' ? undefined : () => setActiva(capa)}
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
            onClick={() => setActiva(capa)}
          >
            {capa === activa ? <Eye size={15} aria-hidden /> : null}
            {NOMBRE[capa]}
          </button>
        ))}
      </div>
    </div>
  )
}
