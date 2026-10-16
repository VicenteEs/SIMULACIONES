'use client'

import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { Crosshair, ScanLine, X } from 'lucide-react'
import {
  ANCHO_MAXIMO_DEL_RECUADRO,
  ANCHO_MINIMO_DEL_RECUADRO,
  PROYECCIONES_DE_FLUOROSCOPIA,
  SEGUNDOS_DE_ESCOPIA_ALTOS,
  SIN_DESPLAZAMIENTO,
  ZOOM_MAXIMO_DE_LA_IMAGEN,
  ZOOM_MINIMO_DE_LA_IMAGEN,
  arrastrarLaImagen,
  limitarAnchoDelRecuadro,
  limitarDesplazamiento,
  limitarZoom,
  type DesplazamientoDeLaImagen,
  type ProyeccionDeFluoroscopia,
} from '@/lib/radiografia'
import type { AyudasDeEscopia } from './LienzoQuirurgico'

/** Los acercamientos que se piden de un toque; el deslizador y la rueda cubren lo que hay entre medias. */
const ZOOMS_RAPIDOS = [1, 2, 4] as const

/** Cuánto se acerca o aleja cada «muesca» de la rueda sobre la imagen. */
const FACTOR_DE_LA_RUEDA = 1.12

const enEspanol = (n: number) => n.toFixed(1).replace('.', ',')

/**
 * La imagen del arco en C, al lado del lienzo (petición de Cristóbal).
 *
 * Solo existe con la fluoroscopia encendida: la imagen en círculo, con lo más denso en negro como en la pantalla
 * del pabellón, las tres proyecciones (AP, lateral y oblicua), el contador de exposición y las dos ayudas de
 * aprendizaje —que se apagan: en una fluoroscopia real nadie dibuja dónde debe quedar el hueso—.
 *
 * La imagen se **arrastra**: en pabellón el arco está quieto y es el miembro el que se mueve para que el foco de
 * fractura o la punta del clavo caiga en el centro. Arrastrar hacia arriba sube la extremidad por la imagen, y
 * con el teclado lo hacen las flechas. El lienzo de la izquierda no se entera: no se mueve nada del paciente.
 *
 * Desde D-175 se acerca hasta 4× (deslizador, tres botones y la rueda sobre la imagen) y el recuadro se ensancha o se
 * estrecha: un borde que se arrastra, y un deslizador «Tamaño» para quien no puede arrastrar —teclado, dedo
 * torpe—. Más ancho no es solo más grande: la imagen se redibuja con más píxeles (`ladoDeLaImagen`), o agrandada
 * se vería borrosa.
 *
 * Es un componente aparte y no parte de la consola por lo mismo que la consola ya no lleva el resto de su
 * marcado: es lo único que cambia con el reloj de la exposición, y en la consola, con su estado entero,
 * el compilador de React no podía conservar las memorias de más abajo si esto vivía dentro.
 */
export function PanelDeFluoroscopia({
  proyeccion,
  segundos,
  zoom,
  ancho,
  ayudas,
  hayFragmento,
  angulacion,
  topeDeAngulacion,
  lienzo,
  desplazamiento,
  alDesplazar,
  alElegirProyeccion,
  alAcercar,
  alCambiarAncho,
  alCambiarAyudas,
  alApagar,
}: {
  proyeccion: ProyeccionDeFluoroscopia
  segundos: number
  zoom: number
  /** Ancho del recuadro, en píxeles. */
  ancho: number
  ayudas: AyudasDeEscopia
  /** El caso declara un fragmento móvil: sin él no hay «dónde debe quedar». */
  hayFragmento: boolean
  /** Los grados entre el eje del hueso fijo y el del fragmento. */
  angulacion: number
  /** El tope de angulación del paso, si el paso mide la reducción. */
  topeDeAngulacion: number | null
  /** Donde se dibuja la imagen: el lienzo 2D que `mando.dibujarFluoroscopia` rellena. */
  lienzo: RefObject<HTMLCanvasElement | null>
  /** Cuánto se ha corrido el miembro bajo el arco, en radios del círculo. */
  desplazamiento: DesplazamientoDeLaImagen
  alDesplazar: (desplazamiento: DesplazamientoDeLaImagen) => void
  alElegirProyeccion: (p: ProyeccionDeFluoroscopia) => void
  alAcercar: (zoom: number) => void
  alCambiarAncho: (ancho: number) => void
  alCambiarAyudas: (ayudas: AyudasDeEscopia) => void
  alApagar: () => void
}) {
  const etiqueta = PROYECCIONES_DE_FLUOROSCOPIA.find((q) => q.valor === proyeccion)?.etiqueta
  // El arrastre sigue al puntero y no al estado: entre dos movimientos seguidos React puede no haber repintado
  // todavía, y partir del valor de la última pantalla perdería un trozo del gesto.
  const actual = useRef(desplazamiento)
  const zoomActual = useRef(zoom)
  const anchoActual = useRef(ancho)
  useEffect(() => {
    actual.current = desplazamiento
    zoomActual.current = zoom
    anchoActual.current = ancho
  }, [desplazamiento, zoom, ancho])
  const agarrado = useRef<{ x: number; y: number } | null>(null)
  const borde = useRef<{ x: number; ancho: number } | null>(null)
  const recuadro = useRef<HTMLDivElement>(null)
  const corrido = desplazamiento.x !== 0 || desplazamiento.y !== 0

  // La rueda sobre la imagen la acerca o la aleja. Se engancha a mano y no con `onWheel`: React registra ese
  // evento como pasivo, y un `preventDefault` en un evento pasivo no hace nada —la página bajaría a la vez que
  // se acerca la imagen—.
  const alAcercarRef = useRef(alAcercar)
  useEffect(() => {
    alAcercarRef.current = alAcercar
  }, [alAcercar])
  useEffect(() => {
    const imagen = lienzo.current
    if (!imagen) return
    const alRodar = (e: WheelEvent) => {
      e.preventDefault()
      const paso = e.deltaY < 0 ? FACTOR_DE_LA_RUEDA : 1 / FACTOR_DE_LA_RUEDA
      alAcercarRef.current(Math.round(limitarZoom(zoomActual.current * paso) * 10) / 10)
    }
    imagen.addEventListener('wheel', alRodar, { passive: false })
    return () => imagen.removeEventListener('wheel', alRodar)
  }, [lienzo])

  const alBajar = (e: PointerEvent<HTMLCanvasElement>) => {
    try {
      // Seguir al puntero aunque salga de la imagen; si el navegador no deja (puntero ya soltado), el arrastre sigue igual.
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // sin captura
    }
    agarrado.current = { x: e.clientX, y: e.clientY }
  }
  const alMover = (e: PointerEvent<HTMLCanvasElement>) => {
    const desde = agarrado.current
    if (!desde) return
    const lado = e.currentTarget.getBoundingClientRect().width
    actual.current = arrastrarLaImagen(actual.current, e.clientX - desde.x, e.clientY - desde.y, lado, zoomActual.current)
    agarrado.current = { x: e.clientX, y: e.clientY }
    alDesplazar(actual.current)
  }
  const alSoltar = () => {
    agarrado.current = null
  }
  const alTeclear = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const paso = 0.12
    // Las flechas mueven la extremidad en el sentido de la flecha, igual que el arrastre.
    const dx = e.key === 'ArrowRight' ? paso : e.key === 'ArrowLeft' ? -paso : 0
    const dy = e.key === 'ArrowUp' ? paso : e.key === 'ArrowDown' ? -paso : 0
    if (dx === 0 && dy === 0) {
      // «+» y «-» acercan y alejan: la rueda no está en un teclado.
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        alAcercar(Math.round(limitarZoom(zoom + 0.5) * 10) / 10)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        alAcercar(Math.round(limitarZoom(zoom - 0.5) * 10) / 10)
      }
      return
    }
    e.preventDefault()
    alDesplazar(limitarDesplazamiento({ x: actual.current.x + dx, y: actual.current.y + dy }, zoom))
  }

  // Lo más ancho que puede ser el recuadro: tres cuartos de lo que mide el lienzo que lo contiene, o el lienzo
  // desaparecería detrás de la imagen que se vino a mirar al lado de él.
  const disponible = () => {
    const marco = recuadro.current?.parentElement
    return marco ? Math.floor(marco.clientWidth * 0.75) : undefined
  }

  // El borde izquierdo del recuadro: arrastrarlo a la izquierda lo ensancha, porque el recuadro va pegado a la
  // derecha tanto al lado del lienzo como encima de él.
  const alBajarElBorde = (e: PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // sin captura
    }
    borde.current = { x: e.clientX, ancho: anchoActual.current }
    e.preventDefault()
  }
  const alMoverElBorde = (e: PointerEvent<HTMLDivElement>) => {
    const desde = borde.current
    if (!desde) return
    alCambiarAncho(limitarAnchoDelRecuadro(desde.ancho + (desde.x - e.clientX), disponible()))
  }
  const alSoltarElBorde = () => {
    borde.current = null
  }
  const alTeclearElBorde = (e: KeyboardEvent<HTMLDivElement>) => {
    const salto = e.shiftKey ? 60 : 20
    const delta = e.key === 'ArrowLeft' ? salto : e.key === 'ArrowRight' ? -salto : 0
    if (delta === 0) return
    e.preventDefault()
    alCambiarAncho(limitarAnchoDelRecuadro(ancho + delta, disponible()))
  }

  const estilo = { '--ancho-escopia': `${ancho}px` } as CSSProperties

  return (
    <div ref={recuadro} className="consola-escopia" role="group" aria-label="Fluoroscopia" style={estilo}>
      <div
        className="consola-escopia-borde"
        role="separator"
        aria-orientation="vertical"
        aria-label="Ancho de la imagen de fluoroscopia"
        aria-valuemin={ANCHO_MINIMO_DEL_RECUADRO}
        aria-valuemax={ANCHO_MAXIMO_DEL_RECUADRO}
        aria-valuenow={ancho}
        tabIndex={0}
        title="Arrastre el borde para hacer la imagen más grande o más pequeña (con el teclado, las flechas)"
        onPointerDown={alBajarElBorde}
        onPointerMove={alMoverElBorde}
        onPointerUp={alSoltarElBorde}
        onPointerCancel={alSoltarElBorde}
        onKeyDown={alTeclearElBorde}
      />
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
        tabIndex={0}
        aria-label={`Imagen de fluoroscopia, proyección ${etiqueta}, acercada ${enEspanol(zoom)} veces. Arrastre para mover la extremidad; con el teclado, las flechas; más y menos acercan.`}
        title="Arrastre para subir o bajar la extremidad bajo el arco; la rueda acerca y aleja"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onKeyDown={alTeclear}
      />
      <p className="consola-escopia-lectura consola-escopia-mover">
        <small>Arrastre la imagen para subir o bajar la extremidad.</small>
        {corrido ? (
          <button type="button" className="consola-escopia-centrar" onClick={() => alDesplazar(SIN_DESPLAZAMIENTO)}>
            <Crosshair size={12} aria-hidden /> Centrar
          </button>
        ) : null}
      </p>
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
          min={ZOOM_MINIMO_DE_LA_IMAGEN}
          max={ZOOM_MAXIMO_DE_LA_IMAGEN}
          step={0.1}
          value={zoom}
          onChange={(e) => alAcercar(limitarZoom(Number(e.target.value)))}
          aria-label="Acercar la imagen de la fluoroscopia"
        />
        <output>{enEspanol(zoom)}×</output>
      </label>
      <div className="consola-escopia-zooms" role="group" aria-label="Acercamientos rápidos">
        {ZOOMS_RAPIDOS.map((z) => (
          <button
            key={z}
            type="button"
            className={`consola-escopia-vista${Math.abs(zoom - z) < 0.05 ? ' activo' : ''}`}
            aria-pressed={Math.abs(zoom - z) < 0.05}
            onClick={() => alAcercar(z)}
          >
            {z}×
          </button>
        ))}
      </div>
      <label className="consola-instrumento-articulacion consola-escopia-zoom">
        <span>Tamaño</span>
        <input
          type="range"
          min={ANCHO_MINIMO_DEL_RECUADRO}
          max={ANCHO_MAXIMO_DEL_RECUADRO}
          step={4}
          value={ancho}
          onChange={(e) => alCambiarAncho(limitarAnchoDelRecuadro(Number(e.target.value), disponible()))}
          aria-label="Tamaño de la imagen de la fluoroscopia"
        />
        <output>{ancho} px</output>
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
