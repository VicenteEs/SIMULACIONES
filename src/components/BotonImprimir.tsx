'use client'

import React from 'react'

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
  return (
    <button
      type="button"
      className="boton secundario boton-imprimir"
      onClick={() => window.print()}
      style={{ marginLeft: 'auto' }}
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'text-bottom' }}>
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Guardar PDF
    </button>
  )
}
