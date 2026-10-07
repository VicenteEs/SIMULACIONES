/**
 * Dónde acaba la diáfisis y empieza el extremo, por la regla del cuadrado de Heim
 * (D-161, E4).
 *
 * AO define el segmento de un extremo como un cuadrado cuyo lado es lo más ancho
 * de la epífisis: la diáfisis es lo que queda entre los dos cuadrados. Aquí se
 * mide sobre la geometría del hueso, a lo largo de su eje (`ejeDelHueso`), con un
 * perfil de anchura: en cada tramo, a qué distancia del eje queda el vértice más
 * lejano.
 *
 * Es una aproximación y se dice: la anchura que se toma es la del vértice más
 * lejano en cualquier dirección, no la de un plano concreto, y en la tibia distal
 * la regla de AO manda otra cosa (el ancho de los maléolos). Para elegir dónde cae
 * una fractura esquemática sobra; para una medida, no sirve.
 *
 * Sin `three`: trabaja con arreglos y con lo que ya devuelve `planoDeCorte.ts`.
 */

import type { EjeDelHueso } from '@/lib/planoDeCorte'

/** Un tramo del eje, de `desde` a `hasta`, en metros desde el centro del hueso. */
export type Tramo = readonly [desde: number, hasta: number]

export interface SegmentosDelHueso {
  proximal: Tramo
  diafisis: Tramo
  distal: Tramo
  /** Lo más ancho de cada epífisis, en metros: el lado del cuadrado. */
  ladoProximal: number
  ladoDistal: number
}

/** Cuántos tramos tiene el perfil. Cuarenta bastan para un hueso de medio metro (1,2 cm cada uno). */
const TRAMOS_DEL_PERFIL = 40

/**
 * Hasta dónde, desde cada extremo, se busca lo más ancho: el tercio. Más allá ya
 * es el cuerpo del hueso, y un fémur con trocánter menor muy marcado midiendo
 * medio hueso daría una epífisis de media diáfisis.
 */
const ZONA_DEL_EXTREMO = 1 / 3

/** Un extremo no mide menos del 8 % del hueso ni más del 33 %: son los límites de lo que se ve como epífisis. */
const MINIMO = 0.08
const MAXIMO = 1 / 3

/**
 * La anchura a lo largo del eje, en `TRAMOS_DEL_PERFIL` tramos de `proximal` a
 * `distal`: el doble de la distancia del vértice más lejano del eje.
 */
export function perfilDeAnchura(posiciones: ArrayLike<number>, eje: EjeDelHueso): number[] {
  const largo = eje.distal - eje.proximal
  const perfil = new Array<number>(TRAMOS_DEL_PERFIL).fill(0)
  if (!(largo > 0)) return perfil
  const [dx, dy, dz] = eje.direccion
  const [cx, cy, cz] = eje.centro
  for (let i = 0; i + 2 < posiciones.length; i += 3) {
    const rx = posiciones[i] - cx
    const ry = posiciones[i + 1] - cy
    const rz = posiciones[i + 2] - cz
    const s = rx * dx + ry * dy + rz * dz
    const t = (s - eje.proximal) / largo
    if (t < 0 || t > 1) continue
    const tramo = Math.min(TRAMOS_DEL_PERFIL - 1, Math.floor(t * TRAMOS_DEL_PERFIL))
    const px = rx - s * dx
    const py = ry - s * dy
    const pz = rz - s * dz
    const distancia = Math.hypot(px, py, pz)
    if (2 * distancia > perfil[tramo]) perfil[tramo] = 2 * distancia
  }
  return perfil
}

/**
 * Los tres segmentos de un hueso largo.
 *
 * El lado del cuadrado de cada extremo es lo más ancho que el perfil alcanza en el
 * tercio de ese extremo, acotado entre el 8 y el 33 % del largo. Los segmentos se
 * dan como tramos del eje, de `proximal` a `distal`, y nunca se solapan: si los
 * dos cuadrados no cupieran en el hueso, se reparten el largo a partes iguales.
 */
export function segmentosDeHeim(posiciones: ArrayLike<number>, eje: EjeDelHueso): SegmentosDelHueso {
  const largo = eje.distal - eje.proximal
  const perfil = perfilDeAnchura(posiciones, eje)
  const zona = Math.max(1, Math.round(TRAMOS_DEL_PERFIL * ZONA_DEL_EXTREMO))
  const ancho = (desde: number, hasta: number) => Math.max(0, ...perfil.slice(desde, hasta))
  const acotar = (lado: number) => Math.min(MAXIMO * largo, Math.max(MINIMO * largo, lado))

  let ladoProximal = acotar(ancho(0, zona))
  let ladoDistal = acotar(ancho(TRAMOS_DEL_PERFIL - zona, TRAMOS_DEL_PERFIL))
  // Dos cuadrados que no dejan diáfisis no son un hueso largo: se achican a la par.
  const sobra = ladoProximal + ladoDistal - 0.8 * largo
  if (sobra > 0) {
    const factor = (ladoProximal + ladoDistal - sobra) / (ladoProximal + ladoDistal)
    ladoProximal *= factor
    ladoDistal *= factor
  }
  const finProximal = eje.proximal + ladoProximal
  const iniDistal = eje.distal - ladoDistal
  return {
    proximal: [eje.proximal, finProximal],
    diafisis: [finProximal, iniDistal],
    distal: [iniDistal, eje.distal],
    ladoProximal,
    ladoDistal,
  }
}

/** Una coordenada a lo largo del eje como el porcentaje (0–100) que usa `planoDelCorte`. */
export function aPorcentaje(eje: EjeDelHueso, s: number): number {
  return ((s - eje.proximal) / (eje.distal - eje.proximal)) * 100
}

/** Lo contrario: de un porcentaje a la coordenada a lo largo del eje. */
export function dePorcentaje(eje: EjeDelHueso, porcentaje: number): number {
  return eje.proximal + (porcentaje / 100) * (eje.distal - eje.proximal)
}

/** El segmento de la tabla (1, 2 o 3) en el que cae una coordenada del eje. */
export function segmentoEnQueCae(s: number, segmentos: SegmentosDelHueso): 1 | 2 | 3 {
  if (s < segmentos.proximal[1]) return 1
  if (s > segmentos.distal[0]) return 3
  return 2
}
