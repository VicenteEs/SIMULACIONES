'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ACCIONES_DE_MOVIMIENTO,
  PASO_FINO,
  PASO_GRANDE,
  ejeValidoPara,
  pasoDeLaTecla,
  sentidoDeLaTecla,
  type AccionDeMovimiento,
  type DefinicionDeAccion,
  type EjeAnatomico,
} from '@/lib/movimientoPorEjes'

/**
 * El menú de movimiento por ejes (P-004 E7, pedido 15 de Cristóbal): tres botones —Trasladar, Angular, Rotar—, y al
 * elegir uno, sus ejes. Elegido un eje, el trozo (o la placa) se mueve con las **flechas del teclado** o arrastrando, y el
 * lienzo dibuja una sola línea en vez de las siete asas.
 *
 * Es genérico: lo usan el trozo de hueso y la placa con la misma interfaz y distinta lista de acciones. Quien lo monta dice
 * **qué hace** un paso (`alMover`) y el menú solo lleva la cuenta de la elección y de las teclas.
 *
 * Las flechas solo mueven mientras no se escribe en un campo y no hay Alt: el teclado sigue siendo del campo numérico
 * cuando tiene el foco, y Mayúsculas / Ctrl cambian el paso (0,2 · 1 · 5).
 */

export interface SeleccionDeMovimiento {
  accion: AccionDeMovimiento
  eje: EjeAnatomico
}

/** ¿El foco está en algo donde las flechas son del campo? */
function esDeEscritura(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false
  const etiqueta = destino.tagName
  return etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT' || destino.isContentEditable
}

export function MenuDeMovimiento({
  acciones = ACCIONES_DE_MOVIMIENTO,
  seleccion,
  alElegir,
  alMover,
  sinObjeto,
  asasLibres,
  alCambiarLasAsas,
  nombreDelObjeto,
}: {
  acciones?: readonly DefinicionDeAccion[]
  seleccion: SeleccionDeMovimiento | null
  alElegir: (seleccion: SeleccionDeMovimiento | null) => void
  /** Aplica un paso (milímetros o grados, con signo) y devuelve la lectura, o `null` si no había nada que mover. */
  alMover: (accion: AccionDeMovimiento, eje: EjeAnatomico, valor: number) => string | null
  /** Lo que se le dice a quien todavía no eligió nada que mover; con él, los botones quedan apagados. */
  sinObjeto?: string
  /** Solo para el trozo de hueso: el interruptor de las asas de siempre. Sin él, no se ofrece. */
  asasLibres?: boolean
  alCambiarLasAsas?: (valor: boolean) => void
  nombreDelObjeto?: string | null
}) {
  const [lectura, setLectura] = useState<string | null>(null)
  // Una acción con varios ejes queda «abierta» a la espera del eje, sin movimiento elegido todavía.
  const [pendiente, setPendiente] = useState<AccionDeMovimiento | null>(null)
  // El manejador del teclado se monta una sola vez por elección y lee lo último por aquí, sin volver a engancharse
  // cada vez que la consola se repinta.
  const ultimo = useRef({ alMover, seleccion })
  useEffect(() => {
    ultimo.current = { alMover, seleccion }
  })

  const activa = seleccion !== null && !sinObjeto
  useEffect(() => {
    if (!activa) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!esDeEscritura(e.target)) alElegir(null)
        return
      }
      const sentido = sentidoDeLaTecla(e.key)
      if (sentido === 0 || e.altKey || esDeEscritura(e.target)) return
      const actual = ultimo.current.seleccion
      if (!actual) return
      e.preventDefault()
      const paso = pasoDeLaTecla({ shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey })
      setLectura(ultimo.current.alMover(actual.accion, actual.eje, sentido * paso))
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [activa, alElegir])

  const definicion = seleccion ? acciones.find((a) => a.accion === seleccion.accion) : undefined

  const elegirAccion = (a: DefinicionDeAccion) => {
    setLectura(null)
    // Con un solo eje posible (Rotar) no hay nada que elegir: queda elegido.
    if (a.ejes.length === 1) {
      alElegir({ accion: a.accion, eje: a.ejes[0].eje })
      return
    }
    // Pulsar la acción ya elegida la suelta; al cambiar de acción se conserva el eje si también sirve.
    if (seleccion?.accion === a.accion) {
      alElegir(null)
      return
    }
    const conservado = seleccion && ejeValidoPara(a.accion, seleccion.eje) ? seleccion.eje : null
    alElegir(conservado ? { accion: a.accion, eje: conservado } : null)
    if (!conservado) setPendiente(a.accion)
  }
  const abierta = seleccion?.accion ?? pendiente
  const definicionAbierta = abierta ? acciones.find((a) => a.accion === abierta) : undefined

  return (
    <div className="consola-menu-de-movimiento" role="group" aria-label="Mover por ejes">
      <div className="consola-menu-de-movimiento-fila">
        <span className="consola-menu-de-movimiento-titulo">{nombreDelObjeto ? `Mover ${nombreDelObjeto}` : 'Mover'}</span>
        {acciones.map((a) => (
          <button
            key={a.accion}
            type="button"
            className={`consola-submodo-boton${abierta === a.accion ? ' activo' : ''}`}
            aria-pressed={abierta === a.accion}
            title={a.ayuda}
            disabled={!!sinObjeto}
            onClick={() => elegirAccion(a)}
          >
            {a.etiqueta}
          </button>
        ))}
        {definicionAbierta && definicionAbierta.ejes.length > 1 ? (
          <span className="consola-menu-de-movimiento-ejes" role="group" aria-label={`Eje de ${definicionAbierta.etiqueta.toLowerCase()}`}>
            {definicionAbierta.ejes.map((e) => (
              <button
                key={e.eje}
                type="button"
                className={`consola-submodo-boton${seleccion?.accion === definicionAbierta.accion && seleccion.eje === e.eje ? ' activo' : ''}`}
                aria-pressed={seleccion?.accion === definicionAbierta.accion && seleccion.eje === e.eje}
                title={e.ayuda}
                disabled={!!sinObjeto}
                onClick={() => {
                  setLectura(null)
                  setPendiente(null)
                  alElegir({ accion: definicionAbierta.accion, eje: e.eje })
                }}
              >
                {e.etiqueta}
              </button>
            ))}
          </span>
        ) : null}
        {alCambiarLasAsas ? (
          <label className="consola-interruptor" title="Muestra las flechas y los aros de siempre sobre el trozo, además del menú.">
            <span>Asas libres</span>
            <input type="checkbox" role="switch" checked={!!asasLibres} onChange={(e) => alCambiarLasAsas(e.target.checked)} />
            <span className="consola-interruptor-pista" aria-hidden />
          </label>
        ) : null}
      </div>
      <p className="consola-ayuda consola-menu-de-movimiento-ayuda" role="status">
        {sinObjeto
          ? sinObjeto
          : activa && definicion
            ? `${definicion.etiqueta}${definicion.ejes.length > 1 ? ` · ${definicion.ejes.find((e) => e.eje === seleccion?.eje)?.etiqueta.toLowerCase()}` : ''}: flechas del teclado (${String(PASO_FINO).replace('.', ',')} con Mayúsculas, ${PASO_GRANDE} con Ctrl) o arrastre.${lectura ? ` ${lectura}` : ''}`
            : 'Elija cómo moverlo: Trasladar, Angular o Rotar.'}
      </p>
    </div>
  )
}
