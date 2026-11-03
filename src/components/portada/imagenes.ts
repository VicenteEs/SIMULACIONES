import type { StaticImageData } from 'next/image'
import type { ImagenDePartida } from '@/lib/espaciosDeLaPagina'
import capaPiel from './imagenes/capa-piel.webp'
import capaMusculo from './imagenes/capa-musculo.webp'
import capaHueso from './imagenes/capa-hueso.webp'
import consola from './imagenes/consola.webp'
import fluoroscopia from './imagenes/fluoroscopia.webp'
import corteCoronal from './imagenes/corte-coronal.webp'
import corteAxial from './imagenes/corte-axial.webp'
import corteSagital from './imagenes/corte-sagital.webp'

/**
 * Las capturas del atlas con que parten las fotos de las páginas públicas
 * (P-007 E2): las «originales» a las que vuelve «Restaurar».
 *
 * Importadas como módulo y no servidas desde `public/` por dos cosas que da
 * `next/image` con una importación y no con una cadena: el desenfoque mientras
 * cargan, que calcula al compilar, y el prefijo `/traumahub`, que a una cadena
 * no se lo pone (`ruta()`).
 *
 * Son WebP sacados de `capturas-del-modelo/` (D-229, D-230), recortados al
 * cuerpo. Las tres capas comparten exactamente el mismo recorte, porque la
 * portada las superpone al cambiar de piel a músculo y a hueso: recortadas cada
 * una a lo suyo, el cuerpo saltaba de tamaño. Si se rehacen las capturas, se
 * rehacen las tres a la vez (`BITACORA.md`, D-235).
 */
export const IMAGENES_DE_PARTIDA: Record<ImagenDePartida, StaticImageData> = {
  'capa-piel': capaPiel,
  'capa-musculo': capaMusculo,
  'capa-hueso': capaHueso,
  consola,
  fluoroscopia,
  'corte-coronal': corteCoronal,
  'corte-axial': corteAxial,
  'corte-sagital': corteSagital,
}
