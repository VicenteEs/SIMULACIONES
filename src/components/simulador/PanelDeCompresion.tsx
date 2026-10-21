'use client'

import { useState } from 'react'
import { NOMBRE_DE_LA_ZONA, resultadoDelOval, zonaDelOval, type ZonaDelOval } from '@/lib/compresion'

/**
 * La vista de trabajo de un orificio oval (P-004 E10, pedido 14 de Cristóbal): «al ir a brocar, ofrecer un zoom al lugar de trabajo y
 * elegir la posición del tornillo respecto al orificio; al hacer clic se marca el punto y dice si es céntrico (no comprime),
 * concéntrico hacia la fractura (no comprime) o excéntrico, más lejos de la fractura (comprime)».
 *
 * Es un esquema del óvalo con una flecha hacia la fractura. Un clic dentro del óvalo marca dónde se broca, y el texto de debajo es
 * lo que decide `resultadoDelOval` (en `src/lib/compresion.ts`, donde Cristóbal puede corregir las reglas). El botón «Acercar» lleva la
 * cámara al orificio.
 */

const ANCHO = 240
const ALTO = 56
/** Lo que mide el óvalo dibujado, en píxeles del esquema: el semilargo del orificio ocupa media longitud. */
const MEDIO_OVALO = 100

const COLOR_DE_LA_ZONA: Record<ZonaDelOval, string> = {
  'cerca-de-la-fractura': '#e0a030',
  centro: '#8a95a5',
  'lejos-de-la-fractura': '#3fb950',
}

export function PanelDeCompresion({
  agujeros,
  semilargoMm,
  ladoDeLaFractura,
  desviaciones,
  perforados,
  alElegirDesviacion,
  alAcercar,
}: {
  /** Cuántos orificios tiene la placa. */
  agujeros: number
  /** El semilargo del óvalo, en mm. */
  semilargoMm: number
  /** Hacia qué sentido del eje de la placa está la fractura respecto de cada orificio; vacío si no se sabe dónde está. */
  ladoDeLaFractura: Record<number, 1 | -1>
  desviaciones: Record<number, number>
  /** Qué orificios ya se perforaron (por su índice). */
  perforados: ReadonlySet<number>
  alElegirDesviacion: (indice: number, mm: number) => void
  alAcercar: (indice: number | null) => void
}) {
  const [elegido, setElegido] = useState(0)
  const [acercado, setAcercado] = useState(false)
  const indice = Math.min(elegido, Math.max(0, agujeros - 1))
  const desviacion = desviaciones[indice] ?? 0
  const lado = ladoDeLaFractura[indice]
  const zona: ZonaDelOval | null = lado === undefined ? null : zonaDelOval(desviacion, lado, semilargoMm)
  const resultado = lado === undefined ? null : resultadoDelOval(desviacion, lado, semilargoMm)
  const yaPerforado = perforados.has(indice)

  // El eje de la placa va de izquierda a derecha en el esquema: el lado positivo a la derecha.
  const equis = ANCHO / 2 + (desviacion / semilargoMm) * MEDIO_OVALO

  const marcar = (e: React.MouseEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - caja.left) / caja.width) * ANCHO
    const mm = Math.max(-semilargoMm, Math.min(semilargoMm, ((x - ANCHO / 2) / MEDIO_OVALO) * semilargoMm))
    alElegirDesviacion(indice, Math.round(mm * 10) / 10)
  }

  return (
    <div className="consola-compresion" role="group" aria-label="Orificios ovales: dónde brocar">
      <p className="consola-instrumento-texto">
        <strong>Orificio oval:</strong> elija dónde brocar. Excéntrico y lejos de la fractura, comprime.
      </p>
      <div className="consola-submodo" role="group" aria-label="Orificio">
        {Array.from({ length: agujeros }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`consola-submodo-boton${i === indice ? ' activo' : ''}`}
            aria-pressed={i === indice}
            title={perforados.has(i) ? `Agujero ${i + 1}: ya perforado` : `Agujero ${i + 1}`}
            onClick={() => setElegido(i)}
          >
            {i + 1}
            {perforados.has(i) ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <svg
        className="consola-compresion-oval"
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        width="100%"
        role="img"
        aria-label={`Esquema del orificio ${indice + 1}: la broca a ${desviacion.toFixed(1).replace('.', ',')} mm del centro`}
        onClick={marcar}
        style={{ cursor: 'crosshair', maxWidth: ANCHO }}
      >
        <rect x={ANCHO / 2 - MEDIO_OVALO - 14} y={12} width={2 * MEDIO_OVALO + 28} height={32} rx={16} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.8} />
        <line x1={ANCHO / 2} y1={8} x2={ANCHO / 2} y2={48} stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        {lado !== undefined ? (
          <text x={lado > 0 ? ANCHO - 4 : 4} y={ALTO - 2} fontSize={10} textAnchor={lado > 0 ? 'end' : 'start'} fill="currentColor" opacity={0.85}>
            {lado > 0 ? 'fractura →' : '← fractura'}
          </text>
        ) : null}
        <circle cx={equis} cy={28} r={6} fill={zona ? COLOR_DE_LA_ZONA[zona] : '#8a95a5'} stroke="#000" strokeWidth={1} />
      </svg>
      <p className="consola-instrumento-texto" role="status">
        {resultado
          ? `${zona ? `${NOMBRE_DE_LA_ZONA[zona].charAt(0).toUpperCase()}${NOMBRE_DE_LA_ZONA[zona].slice(1)}. ` : ''}${resultado.texto}`
          : 'Este caso no tiene un fragmento: no se sabe de qué lado está la fractura y no se puede juzgar la compresión.'}
        {yaPerforado ? ' Este orificio ya está perforado: para cambiar el punto hay que volver a perforarlo.' : ''}
      </p>
      <div className="consola-instrumento-acciones">
        <button
          type="button"
          className="consola-boton"
          onClick={() => {
            alAcercar(acercado ? null : indice)
            setAcercado(!acercado)
          }}
        >
          {acercado ? 'Volver la vista' : 'Acercar al orificio'}
        </button>
      </div>
    </div>
  )
}
