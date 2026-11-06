'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { nombreDelObjeto, type AccionDelObjeto, type ObjetoPuesto } from '@/lib/menuDelObjeto'

/**
 * El menú de algo puesto en el paciente (P-013, pedidos 7 y 14): se abre donde se pinchó el objeto, en la escena o en su
 * fila de «En uso», con lo que ese objeto ofrece (`accionesDelObjeto`). Lo que hace cada opción lo decide la consola.
 *
 * Va con `position: fixed` y se corre para quedar entero en la ventana: abierto junto a un borde, media lista quedaba
 * fuera, como le pasaba al aro del menú radial (P-009). El fondo, invisible, se come el clic que lo cierra para que no
 * llegue al paciente: un clic para cerrar el menú no tiene que cortar ni coser.
 */
export function MenuDelObjeto({
  objeto,
  acciones,
  x,
  y,
  alElegir,
  alCerrar,
}: {
  objeto: ObjetoPuesto
  acciones: readonly AccionDelObjeto[]
  /** Dónde se pinchó, en coordenadas de la ventana. */
  x: number
  y: number
  /** `valor`: los milímetros de un deslizador o la medida elegida en «Cambiar». */
  alElegir: (accion: AccionDelObjeto, valor?: number) => void
  alCerrar: () => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  // Se mide ya pintado y se corre dentro de la ventana: el alto depende de lo que ofrece el objeto.
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.left = `${Math.max(8, Math.min(x + 8, window.innerWidth - r.width - 8))}px`
    el.style.top = `${Math.max(8, Math.min(y + 8, window.innerHeight - r.height - 8))}px`
  }, [x, y, acciones.length])
  useEffect(() => {
    caja.current?.querySelector<HTMLElement>('button, input')?.focus()
  }, [])
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [alCerrar])

  const titulo = nombreDelObjeto(objeto)
  return (
    <>
      <div className="consola-menu-objeto-fondo" onPointerDown={alCerrar} onContextMenu={(e) => e.preventDefault()} />
      <div ref={caja} className="consola-menu-objeto" role="menu" aria-label={titulo} style={{ left: x + 8, top: y + 8 }} onContextMenu={(e) => e.preventDefault()}>
        <div className="consola-menu-objeto-cabecera">
          <strong>{titulo}</strong>
          <button type="button" className="consola-plegar" aria-label="Cerrar el menú" onClick={alCerrar}>
            <X size={14} aria-hidden />
          </button>
        </div>
        {acciones.map((a) => {
          if (a.id === 'apertura' || a.id === 'levantar') {
            return (
              <label key={a.id} className="consola-menu-objeto-deslizador">
                <span>
                  {a.etiqueta} · <output>{Math.round(a.valorMm)} mm</output>
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, Math.round(a.maximoMm))}
                  step={1}
                  value={Math.round(a.valorMm)}
                  onChange={(e) => alElegir(a, Number(e.target.value))}
                  aria-label={`${a.etiqueta}, en milímetros`}
                />
              </label>
            )
          }
          if (a.id === 'cambiar') {
            return (
              <div key={a.id} className="consola-menu-objeto-cambiar" role="group" aria-label={`${a.etiqueta} ${a.unidad === 'mm' ? 'otro largo' : 'otros agujeros'}`}>
                <span className="consola-menu-objeto-rotulo">
                  {a.etiqueta} {a.unidad === 'mm' ? '(largo)' : '(agujeros)'}
                </span>
                <div className="consola-menu-objeto-opciones">
                  {a.opciones.map((o) => (
                    <button
                      key={o.valor}
                      type="button"
                      role="menuitem"
                      className={`consola-menu-objeto-opcion${o.actual ? ' actual' : ''}${o.sugerida ? ' sugerida' : ''}`}
                      disabled={o.actual}
                      aria-label={`${o.etiqueta}${a.unidad === 'agujeros' ? ' agujeros' : ''}${o.actual ? ', la puesta' : ''}${o.sugerida ? ', la que pidió el medidor' : ''}`}
                      title={o.actual ? 'La puesta' : o.sugerida ? 'La que pidió el medidor' : undefined}
                      onClick={() => alElegir(a, o.valor)}
                    >
                      {o.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            )
          }
          return (
            <button
              key={a.id === 'plano' ? `plano-${a.plano}` : a.id}
              type="button"
              role="menuitem"
              className={`consola-menu-objeto-boton${a.id === 'retirar' ? ' retirar' : ''}`}
              title={a.id === 'mover' ? a.ayuda : undefined}
              onClick={() => alElegir(a)}
            >
              {a.etiqueta}
            </button>
          )
        })}
      </div>
    </>
  )
}
