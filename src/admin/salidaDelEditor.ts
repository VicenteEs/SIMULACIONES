/**
 * Quién tiene cambios sin guardar en el panel, para que la barra lateral pueda
 * preguntar antes de sacar a nadie de una pantalla a medio trabajar.
 *
 * El editor de fichas ya preguntaba al salir por sus migas y por «Duplicar»,
 * pero la barra lateral está en el `layout.tsx` del panel, fuera del
 * formulario, y sus enlaces navegaban sin consultar a nadie: con media ficha
 * escrita, pulsar «Comentarios» para mirar uno se llevaba todo por delante.
 * `beforeunload` no ayuda, porque una navegación de cliente del App Router no
 * lo dispara.
 *
 * ## Por qué un registro suelto y no un contexto de React
 *
 * La barra no debe saber qué pantallas existen, ni las pantallas que existe una
 * barra. Hoy se apuntan dos —el editor de fichas y el taller del atlas, que
 * pierde una preparación entera— y la siguiente que tenga trabajo sin guardar
 * solo tiene que apuntarse aquí, sin tocar la barra. Un contexto obligaría a
 * envolver el `layout` —que es de servidor— en un proveedor de cliente solo
 * para esto, y acoplaría las piezas por el árbol.
 *
 * El estado es del módulo, y eso en el servidor sería compartido entre
 * peticiones. No pasa porque solo se escribe desde un `useEffect`, que no corre
 * en el servidor: allí el registro está siempre vacío.
 *
 * ## Por qué cada pantalla apunta una pregunta y no una bandera
 *
 * La primera versión guardaba solo banderas: apuntarse era decir «tengo
 * cambios» desde un efecto que miraba el estado. Al editor le basta, porque su
 * `sucio` es estado de React y cada tecla vuelve a pintar. Al taller del atlas
 * no: lo que puede perder es también el encuadre, y la cámara vive dentro de
 * three.js y no pasa nunca por un pintado —ver `encuadreMovido` en
 * `TallerDeAtlas.tsx`—, así que un efecto colgado de su estado se quedaba con un
 * «no hay nada que perder» de antes de girar el modelo. Con una función, la
 * pregunta se hace en el instante del clic, que es cuando la respuesta vale.
 */

const pantallas = new Map<symbol, () => boolean>()

/**
 * Apunta una pantalla que puede tener cambios sin guardar. Devuelve con qué
 * desapuntarla.
 *
 * `hayQuePerder` se consulta al pulsar un enlace de la barra, no al apuntarse.
 * Sin argumento vale «siempre», para quien ya se apunta solo mientras está
 * sucio, como el editor.
 *
 * Cada llamada lleva su propia ficha y no un contador, para que desapuntar dos
 * veces —el `useEffect` de React lo hace en desarrollo— no borre la de otra
 * pantalla que sigue sucia.
 */
export function apuntarCambiosSinGuardar(hayQuePerder: () => boolean = () => true): () => void {
  const ficha = Symbol('cambios sin guardar')
  pantallas.set(ficha, hayQuePerder)
  return () => {
    pantallas.delete(ficha)
  }
}

/**
 * ¿Alguna pantalla apuntada tiene algo que perder ahora mismo?
 *
 * Una pregunta que falla cuenta como «sí». La barra llama a esto desde el
 * `onNavigate` de sus `<Link>`, y una excepción ahí deja el enlace muerto: la
 * barra entera dejaría de navegar por un fallo de una pantalla que no es suya.
 * Y entre dudar y callar, preguntar de más cuesta un clic; callar de más cuesta
 * el trabajo.
 */
export function hayCambiosSinGuardar(): boolean {
  return [...pantallas.values()].some((hayQuePerder) => {
    try {
      return hayQuePerder()
    } catch {
      return true
    }
  })
}

/**
 * La frase de la pregunta, una sola para todas las salidas.
 *
 * Si las migas del editor y la barra lateral la escribieran cada una a su
 * manera, la misma situación se contestaría con dos preguntas distintas según
 * por dónde se saliera, y la que suene menos grave es la que se acepta sin leer.
 *
 * Dice «pantalla» y no «ficha» porque la barra no sabe quién la apuntó: el mismo
 * aviso sale del editor y del taller del atlas, y en el taller no hay ficha sino
 * una preparación.
 */
export const PREGUNTA_DE_SALIDA =
  'Hay cambios sin guardar en esta pantalla.\n\n¿Salir igual? Se pierde todo lo hecho desde el último guardado.'

/**
 * ¿Se puede salir? Sin nada pendiente, sí y sin preguntar.
 *
 * `preguntar` se recibe para poder probarlo sin navegador; en la pantalla es
 * `window.confirm`, que bloquea y es justo lo que hace falta: la navegación
 * tiene que esperar a la respuesta para poder cancelarse.
 */
export function puedeSalirSinPerderCambios(
  preguntar: (texto: string) => boolean = (texto) => window.confirm(texto),
): boolean {
  return !hayCambiosSinGuardar() || preguntar(PREGUNTA_DE_SALIDA)
}
