import { ruta } from '@/lib/rutas'

/** Adonde lleva el logo, sea cual sea la institución (D-371): es el mismo en todas. */
export const SITIO_DE_CHESSCORE = 'https://chesscore.cl'

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
 *
 * Es además un enlace a `chesscore.cl` (D-378), y va aquí dentro y no en cada
 * sitio que pinta el logo: así el que se agregue mañana nace enlazado. Por eso
 * el texto alternativo dice también adónde lleva. Un enlace hecho solo de una
 * imagen se anuncia por ese texto, y con el nombre de la empresa a secas nadie
 * sabía que salía de la plataforma. Se dijo en el `alt` y no en un texto oculto
 * aparte porque, si la imagen no carga, lo que se lee en su lugar sigue
 * diciendo lo mismo, y no depende de que la hoja de `.sr-only` esté cargada.
 *
 * - **Otra pestaña:** quien está a mitad de un caso o de una ficha no la pierde.
 * - **`noopener` sin `noreferrer`:** chesscore.cl ve que la visita viene de
 *   TraumaHub, y la pestaña nueva sigue sin poder tocar esta.
 * - **Sin `ruta()`:** la dirección es absoluta y de otro dominio, y el prefijo
 *   solo vale para lo propio.
 *
 * El anillo de foco lo decide `sobre` y no el sitio. Sobre el marino el azul de
 * la marca no se ve, y el cian que lo sustituye depende de la clase de lo que
 * rodea al foco (`.admin-sidebar`, `.p-oscuro`…): un logo blanco puesto mañana
 * sobre otro fondo marino saldría con el anillo azul, invisible, sin que nada
 * avisara. Quien elige el archivo blanco ya está diciendo que el fondo es
 * oscuro.
 *
 * Un `<a>` dentro de otro no es HTML válido, así que este componente no sirve
 * dentro de un enlace. Hoy no pasa en ninguno de los cuatro sitios, y
 * `tests/unit/logoChessCore.test.ts` lo vigila; si un día hiciera falta, la
 * salida es una propiedad que apague el enlace, no quitarlo.
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
    <a href={SITIO_DE_CHESSCORE} target="_blank" rel="noopener" className="logo-chesscore-enlace" data-sobre={sobre}>
      <img
        src={ruta(archivo)}
        alt="ChessCore · De peones a reyes (abre chesscore.cl en otra pestaña)"
        width={ancho}
        height={alto}
        className={`logo-chesscore${clase ? ` ${clase}` : ''}`}
        loading="lazy"
        decoding="async"
      />
    </a>
  )
}
