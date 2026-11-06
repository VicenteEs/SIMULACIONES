'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { HandGrab, WandSparkles, X } from 'lucide-react'

/**
 * El cuadro «Reducción manual / Reducción automática» (P-013, pedido 12 de Cristóbal: «al seleccionar "reducción" que
 * aparezca un cuadro encima que diga "Reducción manual / Reducción automática"; al posarse sobre cada botón, que explique
 * de qué se trata»).
 *
 * No es el interruptor de dos posiciones que quitó E4 de P-012 (D-315): ahí «Manual» no hacía nada y «Automática» dejaba
 * el paso sin puntos sin decirlo antes. Aquí cada botón hace algo —«Manual» deja la pinza en la mano, «Automática» lleva
 * los trozos a su sitio— y lo que cuesta va escrito en el propio botón, no solo en la explicación. La explicación sale al
 * pasar el ratón **y** al llegar con el teclado: la ayuda del navegador (`title`) tarda un segundo, no aparece con el
 * teclado y en una tableta no existe.
 *
 * Quien lo monta decide cuándo sale (en práctica, en el paso de reducir, una vez por paso) y qué hace cada elección.
 */

export type EleccionDeLaReduccion = 'manual' | 'automatica'

export const EXPLICACION_DE_LA_REDUCCION: Readonly<Record<EleccionDeLaReduccion, string>> = {
  manual:
    'Usted agarra el fragmento con la pinza de reducción y lo lleva a su sitio con el menú Trasladar · Angular · Rotar, mirando la fluoroscopia. Es el ejercicio de este paso, y suma puntos.',
  automatica:
    'El fragmento y los demás trozos van solos a su sitio, de una vez, para seguir con la fijación sin entramparse en la reducción. Este paso queda sin puntos, aunque después lo deshaga.',
}

const OPCIONES: readonly { cual: EleccionDeLaReduccion; titulo: string; costo: string; Icono: typeof HandGrab }[] = [
  { cual: 'manual', titulo: 'Reducción manual', costo: 'La hace usted · suma puntos', Icono: HandGrab },
  { cual: 'automatica', titulo: 'Reducción automática', costo: 'Va sola a su sitio · sin puntos', Icono: WandSparkles },
]

export function CuadroDeReduccion({
  alElegir,
  alCerrar,
}: {
  alElegir: (cual: EleccionDeLaReduccion) => void
  /** Cerrar sin elegir (la ✕ o Escape): no pasa nada, y las dos siguen en el panel de la pinza. */
  alCerrar: () => void
}) {
  const [explicando, setExplicando] = useState<EleccionDeLaReduccion | null>(null)
  const base = useId()
  const primero = useRef<HTMLButtonElement>(null)
  // El foco entra en el cuadro: quien llegó con el teclado sigue con el teclado, y Escape lo cierra desde ahí.
  useEffect(() => {
    primero.current?.focus()
  }, [])
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [alCerrar])

  return (
    <div className="consola-cuadro-reduccion" role="dialog" aria-labelledby={`${base}-titulo`}>
      <div className="consola-cuadro-reduccion-cabecera">
        <strong id={`${base}-titulo`}>¿Cómo quiere reducir?</strong>
        <button type="button" className="consola-plegar" aria-label="Cerrar sin elegir" onClick={alCerrar}>
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="consola-cuadro-reduccion-opciones">
        {OPCIONES.map(({ cual, titulo, costo, Icono }, i) => (
          <button
            key={cual}
            ref={i === 0 ? primero : undefined}
            type="button"
            className={`consola-cuadro-reduccion-opcion${explicando === cual ? ' explicando' : ''}`}
            // La explicación de cada uno también la oye el lector de pantalla al llegar al botón: está escrita aunque no
            // se vea, y `aria-describedby` la lee igual.
            aria-describedby={`${base}-${cual}`}
            onPointerEnter={() => setExplicando(cual)}
            onFocus={() => setExplicando(cual)}
            onClick={() => alElegir(cual)}
          >
            <Icono size={22} aria-hidden />
            <span className="consola-cuadro-reduccion-titulo">{titulo}</span>
            <span className="consola-cuadro-reduccion-costo">{costo}</span>
          </button>
        ))}
      </div>
      {OPCIONES.map(({ cual }) => (
        <p key={cual} id={`${base}-${cual}`} className="consola-cuadro-reduccion-explicacion" hidden={explicando !== cual}>
          {EXPLICACION_DE_LA_REDUCCION[cual]}
        </p>
      ))}
      {explicando === null ? (
        <p className="consola-cuadro-reduccion-explicacion">Pase el cursor sobre cada opción para ver de qué se trata.</p>
      ) : null}
    </div>
  )
}
