import Image from 'next/image'
import { IMAGENES_DE_PARTIDA } from '@/components/portada/imagenes'
import { encuadreDelSegmento } from '@/lib/encuadreDelSegmento'

/**
 * El segmento recortado del esqueleto del atlas, para la cabecera de una
 * tarjeta (D-237). Una sola captura para todas, agrandada y desplazada hasta
 * el segmento según `encuadreDelSegmento`; el porqué, en ese módulo.
 *
 * Devuelve `null` si el segmento no está en la tabla, y quien la usa no pinta
 * la cabecera: mejor una tarjeta sin imagen que la rodilla en la ficha del
 * codo. Sin estado, así que vale igual en el listado de cliente de la
 * biblioteca y en las páginas de servidor.
 */
export function FiguraDelSegmento({ segmento }: { segmento: unknown }) {
  const encuadre = encuadreDelSegmento(segmento)
  if (!encuadre) return null
  return (
    <span className="figura-segmento" aria-hidden="true">
      <Image
        src={IMAGENES_DE_PARTIDA['capa-hueso']}
        alt=""
        // Lo que mide de verdad: el ancho de la tarjeta por el zoom, unos
        // 400 px por 2,4 en el peor caso.
        sizes="960px"
        placeholder="blur"
        style={{
          width: `${encuadre.zoom * 100}%`,
          transform: `translate(-${encuadre.x * 100}%, -${encuadre.y * 100}%)`,
        }}
      />
    </span>
  )
}

/** Si un segmento tiene recorte: para decidir si la tarjeta lleva cabecera. */
export const tieneFigura = (segmento: unknown): boolean => encuadreDelSegmento(segmento) !== null
