import React from 'react'

/**
 * Fémur esquemático, portado del prototipo original.
 *
 * Se dibuja como dos fragmentos separados por un trazo espiroideo, con una
 * malla de vóxeles superpuesta que lo hace leer como una reconstrucción de
 * tomografía y no como una ilustración. Es la pieza que da carácter a la
 * portada y anticipa de qué trata la plataforma antes de leer una palabra.
 */

const FRAGMENTO_PROXIMAL =
  'M75,45 C90,58 102,70 116,71 C134,72 146,48 162,48 C175,48 181,60 180,76 ' +
  'C182,96 177,110 174,128 C178,210 180,300 180,392 C162,384 138,362 118,346 ' +
  'C116,270 114,200 118,132 C119,120 111,111 99,109 C88,107 79,99 75,88 ' +
  'A27,27 0 1 1 75,45 Z'

const FRAGMENTO_DISTAL =
  'M180,392 C186,440 192,468 196,496 C200,516 192,532 174,532 ' +
  'C162,532 156,522 152,510 L148,510 C144,522 138,532 126,532 ' +
  'C108,532 100,516 104,496 C108,450 114,400 118,346 ' +
  'C138,362 162,384 180,392 Z'

/** Rejilla de vóxeles recortada a un fragmento. */
function Malla({ recorte, desde, hasta }: { recorte: string; desde: number; hasta: number }) {
  const horizontales: number[] = []
  for (let y = desde; y <= hasta; y += 10) horizontales.push(y)
  const verticales: number[] = []
  for (let x = 62; x <= 216; x += 13) verticales.push(x)

  return (
    <g clipPath={`url(#${recorte})`}>
      {horizontales.map((y) => (
        <path key={`h${y}`} d={`M36,${y} H266`} stroke="#7EC4CC" strokeWidth="0.65" opacity="0.26" />
      ))}
      {verticales.map((x) => (
        <path
          key={`v${x}`}
          d={`M${x},${desde} V${hasta}`}
          stroke="#7EC4CC"
          strokeWidth="0.65"
          opacity="0.18"
        />
      ))}
    </g>
  )
}

export function Femur() {
  return (
    <svg viewBox="34 8 184 546" xmlns="http://www.w3.org/2000/svg" className="femur" aria-hidden="true">
      <defs>
        <clipPath id="recorte-proximal">
          <path d={FRAGMENTO_PROXIMAL} />
        </clipPath>
        <clipPath id="recorte-distal">
          <path d={FRAGMENTO_DISTAL} />
        </clipPath>
        <linearGradient id="brillo-hueso" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B8E4EA" stopOpacity="0.9" />
          <stop offset="0.55" stopColor="#9FD9E0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7EC4CC" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      <g className="femur-fragmento">
        <path d={FRAGMENTO_PROXIMAL} fill="url(#brillo-hueso)" stroke="#9FD9E0" strokeWidth="1.4" />
        <Malla recorte="recorte-proximal" desde={40} hasta={400} />
      </g>

      <g className="femur-fragmento femur-distal">
        <path d={FRAGMENTO_DISTAL} fill="url(#brillo-hueso)" stroke="#9FD9E0" strokeWidth="1.4" />
        <Malla recorte="recorte-distal" desde={340} hasta={540} />
      </g>

      {/* El trazo espiroideo: la linea que separa ambos fragmentos. */}
      <path
        d="M118,346 C138,362 162,384 180,392"
        fill="none"
        stroke="#E4736B"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
