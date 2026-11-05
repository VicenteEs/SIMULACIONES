'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { ImagenConCarga } from '@/components/ui/ImagenConCarga'
import type { FotoParaPintar } from './fotos'
import { useEnPantalla, useMenosMovimiento } from './rotacion'

/** Un formato del video, en el orden en que el navegador debe probarlos. */
export interface FuenteDeVideo {
  src: string
  tipo: string
}

/**
 * La lupa de Examina con el video de la maniobra (D-274): la prueba de Lachman
 * hecha en Blender sobre la pierna del atlas, en bucle y sin sonido.
 *
 * Debajo del video está su póster como foto normal, con su texto alternativo:
 * es lo que se ve mientras el video no ha llegado, sin JavaScript o con
 * «reducir movimiento», y lo que lee el lector de pantalla. El video repite lo
 * mismo en movimiento, así que va escondido de la lectura.
 *
 * El botón redondo, que antes era un dibujo de «play» que no hacía nada, ahora
 * manda: pausa y reanuda. WCAG 2.2.2 pide poder parar lo que se mueve solo más
 * de cinco segundos, y este bucle no termina nunca. Con «reducir movimiento»
 * el video no arranca solo, pero el botón lo pone en marcha si se pide.
 *
 * `preload="none"`: la portada ya carga el cuerpo en tres capas, y el video
 * empieza a bajar solo cuando la lupa llega a la pantalla. Fuera de ella se
 * pausa, y vuelve a correr al volver.
 */
export function LupaConVideo({ foto, fuentes }: { foto: FotoParaPintar; fuentes: readonly FuenteDeVideo[] }) {
  const raiz = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const menos = useMenosMovimiento()
  const enPantalla = useEnPantalla(raiz)
  /** Lo que pidió quien mira: `null` mientras no ha tocado el botón. */
  const [pedido, setPedido] = useState<'reproducir' | 'pausar' | null>(null)
  const [corre, setCorre] = useState(false)
  // El video se enseña desde su primer cuadro y ya no se esconde: antes de eso
  // un `<video>` sin datos puede pintarse negro encima del póster, y después,
  // quien lo pausa espera ver el cuadro en que lo paró, no volver al póster.
  const [estrenado, setEstrenado] = useState(false)

  const quiereVerlo = pedido === 'reproducir' || (pedido === null && !menos)

  useEffect(() => {
    const v = video.current
    if (!v) return
    if (enPantalla && quiereVerlo) {
      // `play()` falla si el navegador no deja reproducir solo (ahorro de
      // datos, una política de la empresa): se queda el póster y el botón.
      v.play().catch(() => setCorre(false))
    } else {
      v.pause()
    }
  }, [enPantalla, quiereVerlo])

  return (
    <>
      <div ref={raiz} className="p-lupa">
        <ImagenConCarga
          src={foto.src}
          respaldo={foto.respaldo}
          alt={foto.alt}
          ancho={foto.ancho}
          alto={foto.alto}
          sizes="(max-width: 900px) 80vw, 560px"
          className="p-lupa-foto"
        />
        <video
          ref={video}
          className="p-lupa-video"
          data-visible={estrenado ? '' : undefined}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          onPlaying={() => {
            setCorre(true)
            setEstrenado(true)
          }}
          onPause={() => setCorre(false)}
        >
          {fuentes.map((f) => (
            <source key={f.src} src={f.src} type={f.tipo} />
          ))}
        </video>
      </div>
      <span className="p-ilus-video">
        <button
          type="button"
          className="p-ilus-video-boton"
          aria-label={corre ? 'Pausar el video de la maniobra' : 'Reproducir el video de la maniobra'}
          onClick={() => setPedido(corre ? 'pausar' : 'reproducir')}
        >
          {corre ? <Pause size={28} aria-hidden /> : <Play size={30} aria-hidden />}
        </button>
      </span>
    </>
  )
}
