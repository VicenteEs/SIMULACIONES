'use client'

import type { RefObject } from 'react'
import { ScanLine, X } from 'lucide-react'
import {
  PROYECCIONES_DE_FLUOROSCOPIA,
  SEGUNDOS_DE_ESCOPIA_ALTOS,
  type ProyeccionDeFluoroscopia,
} from '@/lib/radiografia'
import type { AyudasDeEscopia } from './LienzoQuirurgico'

/**
 * La imagen del arco en C, al lado del lienzo (petición de Cristóbal).
 *
 * Solo existe con la fluoroscopia encendida: la imagen en círculo, con lo más denso en negro como en la pantalla
 * del pabellón, las tres proyecciones (AP, lateral y oblicua), el contador de exposición y las dos ayudas de
 * aprendizaje —que se apagan: en una fluoroscopia real nadie dibuja dónde debe quedar el hueso—.
 *
 * Es un componente aparte y no parte de la consola por lo mismo que la consola ya no lleva el resto de su
 * marcado: es lo único que cambia con el reloj de la exposición, y en la consola, con su estado entero,
 * el compilador de React no podía conservar las memorias de más abajo si esto vivía dentro.
 */
export function PanelDeFluoroscopia({
  proyeccion,
  segundos,
  zoom,
  ayudas,
  hayFragmento,
  angulacion,
  topeDeAngulacion,
  lienzo,
  alElegirProyeccion,
  alAcercar,
  alCambiarAyudas,
  alApagar,
}: {
  proyeccion: ProyeccionDeFluoroscopia
  segundos: number
  zoom: number
  ayudas: AyudasDeEscopia
  /** El caso declara un fragmento móvil: sin él no hay «dónde debe quedar». */
  hayFragmento: boolean
  /** Los grados entre el eje del hueso fijo y el del fragmento. */
  angulacion: number
  /** El tope de angulación del paso, si el paso mide la reducción. */
  topeDeAngulacion: number | null
  /** Donde se dibuja la imagen: el lienzo 2D que `mando.dibujarFluoroscopia` rellena. */
  lienzo: RefObject<HTMLCanvasElement | null>
  alElegirProyeccion: (p: ProyeccionDeFluoroscopia) => void
  alAcercar: (zoom: number) => void
  alCambiarAyudas: (ayudas: AyudasDeEscopia) => void
  alApagar: () => void
}) {
  const etiqueta = PROYECCIONES_DE_FLUOROSCOPIA.find((q) => q.valor === proyeccion)?.etiqueta
  return (
    <div className="consola-escopia" role="group" aria-label="Fluoroscopia">
      <p className="consola-escopia-cabeza">
        <span>
          <ScanLine size={14} aria-hidden /> Fluoroscopia · {etiqueta}
        </span>
        <span
          className={`consola-escopia-tiempo u-num${segundos > SEGUNDOS_DE_ESCOPIA_ALTOS ? ' alto' : ''}`}
          aria-label={`${segundos} segundos de escopia`}
        >
          {segundos} s
        </span>
      </p>
      <canvas
        ref={lienzo}
        className="consola-escopia-imagen"
        width={384}
        height={384}
        role="img"
        aria-label={`Imagen de fluoroscopia, proyección ${etiqueta}`}
      />
      <div className="consola-escopia-vistas" role="group" aria-label="Proyección">
        {PROYECCIONES_DE_FLUOROSCOPIA.map((q) => (
          <button
            key={q.valor}
            type="button"
            className={`consola-escopia-vista${proyeccion === q.valor ? ' activo' : ''}`}
            aria-pressed={proyeccion === q.valor}
            title={q.ayuda}
            onClick={() => alElegirProyeccion(q.valor)}
          >
            {q.etiqueta}
          </button>
        ))}
      </div>
      <label className="consola-instrumento-articulacion consola-escopia-zoom">
        <span>Acercar</span>
        <input
          type="range"
          min={0.6}
          max={2}
          step={0.1}
          value={zoom}
          onChange={(e) => alAcercar(Number(e.target.value))}
          aria-label="Acercar la imagen de la fluoroscopia"
        />
        <output>{zoom.toFixed(1).replace('.', ',')}×</output>
      </label>
      <label className="consola-escopia-opcion">
        <input
          type="checkbox"
          checked={ayudas.ejes}
          onChange={(e) => alCambiarAyudas({ ...ayudas, ejes: e.target.checked })}
        />
        <span>
          Guía de ejes
          <small>verde, el hueso fijo · ámbar, el fragmento (en la vista de la izquierda)</small>
        </span>
      </label>
      <label className="consola-escopia-opcion">
        <input
          type="checkbox"
          checked={ayudas.objetivo}
          disabled={!hayFragmento}
          onChange={(e) => alCambiarAyudas({ ...ayudas, objetivo: e.target.checked })}
        />
        <span>
          Dónde debe quedar
          <small>silueta verde del fragmento reducido</small>
        </span>
      </label>
      {ayudas.ejes ? (
        <p className="consola-escopia-lectura">
          Entre los dos ejes hay <strong className="u-num">{angulacion}°</strong>
          {topeDeAngulacion !== null
            ? angulacion > topeDeAngulacion
              ? `: se pasa del tope de ${topeDeAngulacion}°.`
              : `: dentro del tope de ${topeDeAngulacion}°.`
            : '.'}
        </p>
      ) : null}
      {segundos > SEGUNDOS_DE_ESCOPIA_ALTOS ? (
        <p className="consola-escopia-aviso">Mucha exposición. En pabellón se dispara, se mira y se apaga.</p>
      ) : null}
      <button type="button" className="consola-boton consola-boton-ancho" onClick={alApagar}>
        <X size={14} aria-hidden /> Apagar la fluoroscopia
      </button>
    </div>
  )
}
