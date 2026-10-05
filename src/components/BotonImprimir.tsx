'use client'

import { Printer } from 'lucide-react'

/**
 * Botón de impresión de la ficha.
 *
 * Sin `aria-label`: el que había («Imprimir o guardar como PDF») sustituía al
 * texto visible y el nombre accesible dejaba de contener la cadena que el
 * usuario lee en pantalla. Quien maneja el equipo por voz dice «pulsar Guardar
 * PDF», el sistema compara lo dicho con el nombre accesible y no encontraba
 * nada: el botón estaba a la vista y no obedecía al único nombre legible
 * (WCAG 2.5.3, Etiqueta en el nombre). Si alguna vez hace falta aclarar el
 * destino, el nombre tiene que empezar por «Guardar PDF».
 */
export function BotonImprimir() {
  // Fantasma y pequeño, en la barra de acciones de la ficha junto a «Marcar
  // como leída» y «Comentar». Antes era un botón secundario grande metido en la
  // miga con `marginLeft: auto` en línea, y competía con el título.
  return (
    <button
      type="button"
      className="boton boton-fantasma boton-sm boton-imprimir"
      onClick={() => window.print()}
    >
      <Printer size={16} aria-hidden="true" />
      Guardar PDF
    </button>
  )
}
