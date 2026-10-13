/**
 * La incisión en línea recta: marcar el inicio y el final y que el trazo sea la
 * recta que los une (petición de Cristóbal).
 *
 * A mano alzada con el ratón la línea sale temblorosa —«como la Tacorne»—, y una
 * incisión de abordaje es una recta. Se ofrecen las dos: la mano alzada de
 * siempre, para quien quiera dibujar una curva, y la recta entre dos clics, que
 * es la que se pide para una incisión limpia.
 *
 * La recta se define **en pantalla**, entre dos puntos, y no en el espacio: el
 * cirujano ve la incisión en la imagen. Cada punto intermedio se lleva luego a
 * la superficie con un rayo desde la cámara (eso lo hace el lienzo), de modo que
 * la línea se pega al muslo o a la tibia aunque estén curvos y, vista desde donde
 * se trazó, es exactamente recta.
 *
 * Aquí está solo el reparto de los puntos, que es lo que se prueba.
 */

export interface PuntoDePantalla {
  x: number
  y: number
}

/** Cómo se traza: la recta entre dos clics, o a mano alzada. */
export type TipoDeTrazo = 'recto' | 'libre'

export const TIPOS_DE_TRAZO: readonly { valor: TipoDeTrazo; etiqueta: string; ayuda: string }[] = [
  {
    valor: 'recto',
    etiqueta: 'Línea recta',
    ayuda: 'Un clic marca el inicio de la incisión y otro el final: la recta entre los dos.',
  },
  {
    valor: 'libre',
    etiqueta: 'Mano alzada',
    ayuda: 'Arrastre sobre el modelo para dibujar la incisión con la forma que quiera.',
  },
]

/**
 * Puntos equiespaciados de `a` a `b`, extremos incluidos.
 *
 * `separacion` es la distancia máxima entre dos consecutivos, en las mismas
 * unidades que los puntos. Al menos dos puntos siempre: una recta sin extremos
 * no es una incisión. Con los extremos iguales devuelve un solo punto repetido
 * dos veces, y quien llama decide que eso es demasiado corto.
 */
export function muestrasEntre(a: PuntoDePantalla, b: PuntoDePantalla, separacion: number): PuntoDePantalla[] {
  const largo = Math.hypot(b.x - a.x, b.y - a.y)
  const tramos = Math.max(1, Math.ceil(largo / Math.max(1e-6, separacion)))
  const salida: PuntoDePantalla[] = []
  for (let i = 0; i <= tramos; i++) {
    const t = i / tramos
    salida.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return salida
}

/** Cuánto hay que separar los clics (en píxeles) para que valga como incisión y no como un clic suelto. */
export const LARGO_MINIMO_DE_LA_RECTA_PX = 12

export const esRectaValida = (a: PuntoDePantalla, b: PuntoDePantalla): boolean =>
  Math.hypot(b.x - a.x, b.y - a.y) >= LARGO_MINIMO_DE_LA_RECTA_PX
