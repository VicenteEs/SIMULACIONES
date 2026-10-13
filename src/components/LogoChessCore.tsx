import { ruta } from '@/lib/rutas'

/**
 * El logotipo de ChessCore, la empresa que desarrolló la plataforma.
 *
 * Dos archivos y no uno porque el original es **negro sobre transparente**: sobre
 * el fondo marino de la barra del panel y de la portada sin sesión se vuelve
 * invisible, y filtrarlo con CSS (`filter: invert(1)`) cambia de color a todo lo
 * que lo rodee el día que alguien añada otra cosa a esa regla. El blanco sale del
 * mismo dibujo (`public/logo-chesscore-claro.png`), así que los dos tienen
 * exactamente la misma forma.
 *
 * Ojo con el origen: `LOGO.png` trae canal alfa pero **opaco entero** —es negro
 * sobre un fondo blanco, no sobre transparencia—, y pintado tal cual sobre la
 * barra marina salía una caja blanca. Los dos archivos se hicieron convirtiendo
 * la luminancia en transparencia (lo negro es tinta, lo blanco es nada) y
 * recortando el margen, de ahí las proporciones de 414 × 248.
 *
 * Se eligió `LOGO.png` entre los seis de `fotos_chesscore/` por tamaño y por
 * lectura: es el más grande (481 × 317 de origen, que aguanta una pantalla de alta
 * densidad a 30 px de alto) y lleva el rey y la frase «De peones a reyes» junto al
 * nombre. Los otros cinco miden 142 × 84 como mucho y se pixelan en cuanto se
 * pintan a más de 40 px.
 *
 * El texto alternativo nombra a la empresa y no repite «logotipo»: el lector de
 * pantalla ya sabe que es una imagen.
 */
export function LogoChessCore({
  sobre = 'papel',
  alto = 30,
  clase = '',
}: {
  /** El fondo sobre el que va: `papel` (claro, logo negro) u `oscuro` (marino, logo blanco). */
  sobre?: 'papel' | 'oscuro'
  /** Alto en píxeles; el ancho sale de la proporción del dibujo (414 × 248). */
  alto?: number
  clase?: string
}) {
  const archivo = sobre === 'oscuro' ? '/logo-chesscore-claro.png' : '/logo-chesscore.png'
  const ancho = Math.round((alto * 414) / 248)
  return (
    <img
      src={ruta(archivo)}
      alt="ChessCore · De peones a reyes"
      width={ancho}
      height={alto}
      className={`logo-chesscore${clase ? ` ${clase}` : ''}`}
      loading="lazy"
      decoding="async"
    />
  )
}
