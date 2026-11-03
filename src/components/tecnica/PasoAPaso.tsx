'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, RotateCcw, Scissors } from 'lucide-react'
import { anotarSeccion } from '@/app/(frontend)/acciones/actividad'

/**
 * La técnica AO de un paso en un paso, como el tablero de Penpot (P-007 E4,
 * D-237): el progreso arriba, la lista de pasos a la izquierda, el modelo o la
 * imagen en el centro y, a la derecha, qué se hace, el principio AO y la nota.
 *
 * Antes era la secuencia entera en una sola columna, con un visor 3D por paso
 * montado a la vez: seis pasos con modelo eran seis contextos WebGL abiertos,
 * cerca del tope que el navegador tolera antes de empezar a perder alguno. Aquí
 * solo se monta el `visual` del paso a la vista. El texto de todos sí se monta
 * —escondido con `hidden`—, porque en papel salen todos los pasos seguidos.
 *
 * El contenido lo pinta el servidor, con su texto rico, y llega como nodos: el
 * cliente decide cuál se ve y no vuelve a recibir el caso como datos.
 *
 * El paso elegido vive en el ancla, `#paso-3`, que es la que pone «Continúa
 * leyendo» de la portada (`dondeSeQuedo`), y cada cambio del residente se anota
 * con `anotarSeccion` para que esa tarjeta sepa dónde se quedó.
 */

export interface PasoDelCaso {
  numero: number
  titulo: string
  /** Qué se hace, el principio AO y la nota, ya pintados. */
  contenido: ReactNode
  /** El modelo 3D del paso o la imagen del segmento; `null` si no hay ninguno. */
  visual: ReactNode
}

const ancla = (numero: number) => `paso-${numero}`

function numeroDelAncla(hash: string, total: number): number | null {
  const hallado = /^#paso-(\d+)$/.exec(hash)
  if (!hallado) return null
  const numero = Number(hallado[1])
  return numero >= 1 && numero <= total ? numero : null
}

export function PasoAPaso({
  documentoId,
  pasos,
  simulador,
}: {
  documentoId: string
  pasos: PasoDelCaso[]
  /** El caso del simulador del mismo código AO, si lo hay (`delMismoSegmento`). */
  simulador: { href: string; titulo: string } | null
}) {
  const [actual, setActual] = useState(1)
  const botones = useRef<Record<number, HTMLButtonElement | null>>({})
  const total = pasos.length

  // El ancla manda al llegar y cuando cambia sin recargar (el botón «atrás»).
  useEffect(() => {
    const leerAncla = () => {
      const numero = numeroDelAncla(window.location.hash, total)
      if (numero) setActual(numero)
    }
    leerAncla()
    window.addEventListener('hashchange', leerAncla)
    return () => window.removeEventListener('hashchange', leerAncla)
  }, [total])

  // En el teléfono la lista es una tira que se desliza: el paso elegido tiene
  // que quedar a la vista en ella, o «Siguiente paso» lo empuja fuera. Se
  // desliza la tira y nada más; `scrollIntoView` movía también la página, y al
  // cargar con la tira bajo el pliegue saltaba hasta ella sin que nadie tocara
  // nada.
  useEffect(() => {
    const boton = botones.current[actual]
    const tira = boton?.parentElement
    if (!boton || !tira || tira.scrollWidth <= tira.clientWidth) return
    const b = boton.getBoundingClientRect()
    const t = tira.getBoundingClientRect()
    tira.scrollBy({ left: b.left - t.left - (t.width - b.width) / 2 })
  }, [actual])

  function elegir(numero: number, conFoco = false) {
    if (numero === actual || numero < 1 || numero > total) return
    setActual(numero)
    // `replaceState`, como las pestañas de la ficha: con `location.hash` cada
    // paso sería una entrada del historial y «atrás» repasaría la técnica en
    // vez de volver a la lista.
    window.history.replaceState(null, '', `#${ancla(numero)}`)
    if (conFoco) botones.current[numero]?.focus()
    anotarSeccion('casos-ao', documentoId, numero)
  }

  function alTeclear(evento: KeyboardEvent<HTMLButtonElement>) {
    const destino =
      evento.key === 'ArrowDown' || evento.key === 'ArrowRight'
        ? actual + 1
        : evento.key === 'ArrowUp' || evento.key === 'ArrowLeft'
          ? actual - 1
          : evento.key === 'Home'
            ? 1
            : evento.key === 'End'
              ? total
              : null
    if (destino === null) return
    evento.preventDefault()
    elegir(Math.min(Math.max(destino, 1), total), true)
  }

  const paso = pasos[actual - 1]
  const porcentaje = Math.round((actual / total) * 100)
  const ultimo = actual === total

  return (
    <section className="paso-a-paso" aria-label="Pasos de la técnica">
      <div className="paso-a-paso-barra">
        <div className="paso-a-paso-progreso">
          <p aria-live="polite">
            <strong>
              Paso {actual} de {total}
            </strong>
            <span className="paso-a-paso-titulo-actual"> · {paso?.titulo}</span>
          </p>
          <span className="paso-a-paso-porcentaje">{porcentaje} %</span>
          <span className="paso-a-paso-carril" aria-hidden="true">
            <span style={{ width: `${porcentaje}%` }} />
          </span>
        </div>
        <div className="paso-a-paso-acciones">
          {simulador ? (
            <Link className="boton boton-secundario" href={simulador.href} title={simulador.titulo}>
              <Scissors size={18} aria-hidden="true" />
              Ver en el simulador
            </Link>
          ) : null}
          {/* En el último paso vuelve al primero en vez de apagarse: un botón
              gris al final de la técnica se lee como un error, y repasar desde
              el principio es lo que se hace después. */}
          <button type="button" className="boton" onClick={() => elegir(ultimo ? 1 : actual + 1)}>
            {ultimo ? (
              <>
                <RotateCcw size={18} aria-hidden="true" />
                Volver al primer paso
              </>
            ) : (
              <>
                Siguiente paso
                <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>

      <div className="paso-a-paso-cuerpo">
        <div className="paso-a-paso-lista" role="tablist" aria-orientation="vertical" aria-label="Pasos">
          {pasos.map((p) => {
            const elegido = p.numero === actual
            // «Hecho» es «antes del que se está mirando», no una marca guardada:
            // la técnica se recorre en orden y la marca de leída es del caso
            // entero, en la cabecera.
            const estado = elegido ? 'actual' : p.numero < actual ? 'hecho' : 'pendiente'
            return (
              <button
                key={p.numero}
                ref={(b) => {
                  botones.current[p.numero] = b
                }}
                type="button"
                role="tab"
                id={`pestana-${ancla(p.numero)}`}
                aria-selected={elegido}
                aria-controls={ancla(p.numero)}
                tabIndex={elegido ? 0 : -1}
                className="paso-a-paso-paso"
                data-estado={estado}
                onClick={() => elegir(p.numero)}
                onKeyDown={alTeclear}
              >
                <span className="paso-a-paso-marca" aria-hidden="true">
                  {estado === 'hecho' ? <Check size={15} strokeWidth={3} /> : p.numero}
                </span>
                <span className="paso-a-paso-nombre">{p.titulo}</span>
              </button>
            )
          })}
        </div>

        {pasos.map((p) => {
          const elegido = p.numero === actual
          const conVisual = elegido && p.visual
          return (
            <section
              key={p.numero}
              id={ancla(p.numero)}
              role="tabpanel"
              aria-labelledby={`pestana-${ancla(p.numero)}`}
              className="paso-a-paso-panel"
              data-con-visual={conVisual ? '' : undefined}
              hidden={!elegido}
            >
              {conVisual ? <div className="paso-a-paso-visual">{p.visual}</div> : null}
              <div className="paso-a-paso-texto">{p.contenido}</div>
            </section>
          )
        })}
      </div>
    </section>
  )
}
