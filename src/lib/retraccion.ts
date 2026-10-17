/**
 * Retraer un músculo sin cortarlo (P-003 E10).
 *
 * Un separador apoyado en el borde de un músculo lo aparta para ver lo que hay debajo, como al retraer el pectoral mayor
 * para llegar al tendón conjunto. No hay corte: los vértices cercanos al apoyo se desplazan en la dirección del
 * separador con un peso que cae suave con la distancia, y al cerrar cada uno vuelve a su sitio. Por eso la cuenta parte
 * siempre de las posiciones **originales** y no de las actuales: aplicar dos veces la misma apertura no puede sumar, y
 * cerrar tiene que devolver exactamente lo que había.
 *
 * Todo en las unidades de la escena. Quien llama convierte los milímetros con la escala del modelo.
 */

export type Vec3 = readonly [number, number, number]

/** Radio de la zona que acompaña al separador (el sigma de la campana), en milímetros. */
export const RADIO_DE_RETRACCION_MM = 40

/**
 * El peso con que un vértice sigue al apoyo: 1 en el apoyo y cae como una campana de Gauss. A tres sigmas ya es
 * prácticamente cero, y ahí se corta de verdad (peso exacto 0) para que lo lejano no se mueva ni un epsilon.
 */
export function pesoDeRetraccion(distancia: number, radio: number): number {
  if (radio <= 0) return distancia === 0 ? 1 : 0
  const limite = radio * 3
  if (distancia >= limite) return 0
  const x = distancia / radio
  // Se resta el valor en el límite para que la campana llegue a 0 sin escalón.
  const enElLimite = Math.exp(-4.5)
  return Math.max(0, (Math.exp(-0.5 * x * x) - enElLimite) / (1 - enElLimite))
}

/**
 * Escribe en `destino` las posiciones de `original` con la retracción aplicada.
 *
 * `apoyo` y `direccion` (unitaria) son del espacio de las posiciones; `apertura` y `radio` están en esas mismas
 * unidades. Con `apertura` 0 deja `destino` idéntico a `original`. Devuelve cuántos vértices se movieron, que es lo
 * que permite decir «el separador no tocó nada» cuando se apoya lejos del músculo.
 */
export function retraerVertices(
  original: ArrayLike<number>,
  destino: { [indice: number]: number; length: number },
  apoyo: Vec3,
  direccion: Vec3,
  apertura: number,
  radio: number,
): number {
  let movidos = 0
  for (let i = 0; i + 2 < original.length; i += 3) {
    const dx = original[i] - apoyo[0]
    const dy = original[i + 1] - apoyo[1]
    const dz = original[i + 2] - apoyo[2]
    const peso = apertura === 0 ? 0 : pesoDeRetraccion(Math.hypot(dx, dy, dz), radio)
    const desplazamiento = peso * apertura
    destino[i] = original[i] + direccion[0] * desplazamiento
    destino[i + 1] = original[i + 1] + direccion[1] * desplazamiento
    destino[i + 2] = original[i + 2] + direccion[2] * desplazamiento
    if (desplazamiento !== 0) movidos += 1
  }
  return movidos
}
