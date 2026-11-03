'use client'

import React, { useCallback, useState } from 'react'
import Image, { type StaticImageData } from 'next/image'
import { ImageOff } from 'lucide-react'

/**
 * Una imagen de las páginas públicas que avisa mientras llega y sobrevive a no
 * llegar (P-007 E1).
 *
 * Las de partida son capturas del atlas importadas como módulo, y `next/image`
 * les pone solo el desenfoque mientras cargan. Las que el administrador sube
 * desde «Medios de la página» llegan como cadena (`ruta('/api/pagina/…')`) y
 * no tienen desenfoque, así que mientras tanto va encima la silueta de carga de
 * `Esqueleto.tsx`. Si la subida no llega —se borró el archivo del disco, el
 * volumen no se montó—, se pinta `respaldo`, que es la original del espacio:
 * una portada con un hueco gris en el sitio de la foto parece rota, y la foto
 * de siempre no.
 *
 * Sin respaldo, o si falla también el respaldo, queda un recuadro con el ícono y
 * la descripción: nunca el ícono de imagen rota del navegador.
 */
export function ImagenConCarga({
  src,
  respaldo,
  alt,
  sizes,
  ancho,
  alto,
  prioridad = false,
  className,
}: {
  src: StaticImageData | string
  /** La imagen original del espacio, para cuando `src` no se puede cargar. */
  respaldo?: StaticImageData
  /** Obligatoria: es lo que lee quien no ve la foto, y lo que queda si la foto no llega. */
  alt: string
  /** Cuánto ocupa en pantalla, para que el navegador elija el tamaño del `srcset`. */
  sizes: string
  /** Para una cadena, el tamaño intrínseco; una importación ya lo trae. */
  ancho?: number
  alto?: number
  /** La imagen principal de la primera pantalla: se pide antes y sin esperar al desplazamiento. */
  prioridad?: boolean
  className?: string
}) {
  const [usandoRespaldo, setUsandoRespaldo] = useState(false)
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'rota'>('cargando')

  const actual = usandoRespaldo && respaldo ? respaldo : src
  const conDesenfoque = typeof actual === 'object' && Boolean(actual.blurDataURL)

  const fallar = useCallback(() => {
    if (respaldo && !usandoRespaldo) {
      setUsandoRespaldo(true)
      setEstado('cargando')
    } else {
      setEstado('rota')
    }
  }, [respaldo, usandoRespaldo])

  // Una imagen que ya estaba en la caché puede terminar de cargar antes de que
  // React enganche `onLoad`, y entonces el evento no llega nunca: la silueta se
  // quedaba encima de una foto ya pintada. Al montarse se mira cómo quedó.
  const alMontar = useCallback(
    (nodo: HTMLImageElement | null) => {
      if (!nodo?.complete) return
      if (nodo.naturalWidth > 0) setEstado('lista')
      else if (nodo.currentSrc) fallar()
    },
    [fallar],
  )

  if (estado === 'rota') {
    return (
      <span className={`imagen-con-carga imagen-con-carga-rota ${className ?? ''}`} role="img" aria-label={alt}>
        <ImageOff size={28} aria-hidden />
      </span>
    )
  }

  const medidas =
    typeof actual === 'object' ? {} : { width: ancho ?? 1600, height: alto ?? 1000 }

  return (
    <span className={`imagen-con-carga ${className ?? ''}`} data-estado={estado}>
      {estado === 'cargando' && !conDesenfoque ? <span className="esqueleto imagen-con-carga-esqueleto" aria-hidden /> : null}
      <Image
        key={usandoRespaldo ? 'respaldo' : 'principal'}
        ref={alMontar}
        src={actual}
        alt={alt}
        sizes={sizes}
        {...medidas}
        placeholder={conDesenfoque ? 'blur' : 'empty'}
        loading={prioridad ? 'eager' : 'lazy'}
        fetchPriority={prioridad ? 'high' : 'auto'}
        onLoad={() => setEstado('lista')}
        onError={fallar}
      />
    </span>
  )
}
