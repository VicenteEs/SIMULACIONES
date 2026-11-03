import type { StaticImageData } from 'next/image'
import { espacioDeFoto } from '@/lib/espaciosDeLaPagina'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { IMAGENES_DE_PARTIDA } from './imagenes'

/**
 * Lo que necesita `ImagenConCarga` para pintar la foto de un espacio, ya
 * decidido: la subida si la hay, y si no la captura de partida.
 *
 * Es un objeto plano a propósito, para poder pasarlo tal cual a un componente
 * de cliente (las capas del capítulo Estudia, la cápsula del cuerpo).
 */
export interface FotoParaPintar {
  src: StaticImageData | string
  /** La captura de partida, para cuando la subida no llega. */
  respaldo: StaticImageData
  alt: string
  ancho?: number
  alto?: number
  /**
   * Si es la captura de partida. Las ilustraciones encuadran la de partida
   * —las rodillas de la capa de músculo, la tibia del esqueleto— con posiciones
   * medidas sobre ella; sobre una foto subida esas posiciones no significan
   * nada, y se pinta entera.
   */
  original: boolean
}

export function fotoParaPintar(pagina: PaginaLeida, id: string): FotoParaPintar {
  const espacio = espacioDeFoto(id)
  if (!espacio) throw new Error(`El espacio de foto ${id} no está en espaciosDeLaPagina.ts`)
  const respaldo = IMAGENES_DE_PARTIDA[espacio.original]
  const subida = pagina.foto(id)
  if (!subida) return { src: respaldo, respaldo, alt: espacio.descripcion, original: true }
  return {
    src: subida.src,
    respaldo,
    alt: subida.alt,
    ...(subida.ancho ? { ancho: subida.ancho } : {}),
    ...(subida.alto ? { alto: subida.alto } : {}),
    original: false,
  }
}
