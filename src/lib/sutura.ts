/**
 * La sutura del simulador: qué se mide de una línea de puntadas (D-169).
 *
 * El lienzo dibuja el hilo; esto decide qué significa. Está aparte, sin `three`,
 * porque son cuentas que se pueden equivocar sin que se note —una puntada que
 * «cruza» la herida y no la cierra, una separación medida en unidades del archivo
 * y dicha en milímetros— y que se prueban mejor con números que con una escena.
 *
 * ## Qué es una puntada aquí
 *
 * Un clic sobre el tejido. Cada clic suma un punto a la **línea** que se está
 * cosiendo y el hilo se dibuja del punto anterior a este, pegado a la piel. No es
 * una puntada de verdad (entrar por un borde, salir por el otro y anudar), sino lo
 * que enseña el gesto: dónde se pica, a qué distancia y de qué lado de la herida.
 * Un punto que cae al otro lado de la herida que el anterior **cruza**: es lo que
 * acerca los bordes.
 */

export type Vec3 = [number, number, number]

/** Un punto de la sutura, en el espacio del mundo del lienzo. */
export interface PuntoDeSutura {
  punto: Vec3
  normal: Vec3
  /**
   * De qué lado de la herida cae: 1, −1, o 0 si no hay herida cerca. Lo decide el
   * lienzo con la geometría de la herida; aquí solo se compara.
   */
  lado: 1 | -1 | 0
  /** Empieza una línea nueva: no se une al punto anterior. */
  nuevaLinea: boolean
}

/** Entre qué separaciones una puntada de piel se considera bien puesta, en mm. */
export const SEPARACION_IDEAL_MM = { min: 5, max: 10 }

/** Una puntada más lejos que esto de otra no «cose»: es un salto, no una puntada. */
export const SEPARACION_MAXIMA_MM = 25

export interface MedidaDeLaSutura {
  puntadas: number
  /** Los tramos de hilo entre puntos de una misma línea. */
  tramos: number
  largoDeHiloMm: number
  /** Los tramos que van de un lado de la herida al otro. */
  cruces: number
  /** Separación entre puntos consecutivos de una línea, en mm. */
  separacionesMm: number[]
  separacionMediaMm: number
  separacionMinimaMm: number
  separacionMaximaMm: number
  /** Cuántas separaciones quedan entre 5 y 10 mm, de las medidas. */
  bienEspaciadas: number
}

const distancia = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * Mide una sutura. `milimetrosPorUnidad` pasa del espacio del lienzo a milímetros.
 *
 * Un tramo que cruza la herida cuenta como **cruce** solo si sus dos extremos
 * están a un lado y a otro (`lado` distinto y ninguno cero). Un tramo que sube por
 * la piel sin cruzar, o una línea sobre piel sin herida, no cierra nada.
 */
export function medirLaSutura(puntos: readonly PuntoDeSutura[], milimetrosPorUnidad: number): MedidaDeLaSutura {
  const escala = milimetrosPorUnidad || 1000
  const separacionesMm: number[] = []
  let cruces = 0
  let largoDeHiloMm = 0
  for (let i = 1; i < puntos.length; i += 1) {
    const actual = puntos[i]
    if (actual.nuevaLinea) continue
    const anterior = puntos[i - 1]
    const mm = distancia(anterior.punto, actual.punto) * escala
    separacionesMm.push(mm)
    largoDeHiloMm += mm
    if (anterior.lado !== 0 && actual.lado !== 0 && anterior.lado !== actual.lado) cruces += 1
  }
  const suma = separacionesMm.reduce((a, b) => a + b, 0)
  return {
    puntadas: puntos.length,
    tramos: separacionesMm.length,
    largoDeHiloMm,
    cruces,
    separacionesMm,
    separacionMediaMm: separacionesMm.length > 0 ? suma / separacionesMm.length : 0,
    separacionMinimaMm: separacionesMm.length > 0 ? Math.min(...separacionesMm) : 0,
    separacionMaximaMm: separacionesMm.length > 0 ? Math.max(...separacionesMm) : 0,
    bienEspaciadas: separacionesMm.filter((s) => s >= SEPARACION_IDEAL_MM.min && s <= SEPARACION_IDEAL_MM.max).length,
  }
}

/**
 * Cuánto de la herida cierra la sutura, de 0 (abierta) a 1 (cerrada).
 *
 * Cada cruce acerca los bordes en un tramo de la herida de `SEPARACION_IDEAL_MM.max`
 * (diez milímetros, lo que cubre una puntada bien espaciada). Con tantos cruces
 * como tramos de ese largo, la herida queda cerrada. No es física: es la forma de
 * que el hilo se note, y de que coser mal —muy pocas puntadas— deje la herida
 * entreabierta.
 */
export function cierreDeLaHerida(cruces: number, largoDeLaHeridaMm: number): number {
  if (!(largoDeLaHeridaMm > 0) || cruces <= 0) return 0
  return Math.min(1, (cruces * SEPARACION_IDEAL_MM.max) / largoDeLaHeridaMm)
}

/** Lo que se dice de la última puntada, o `null` si estuvo bien (o fue la primera). */
export function juicioDeLaPuntada(separacionMm: number | null): string | null {
  if (separacionMm === null) return null
  if (separacionMm > SEPARACION_MAXIMA_MM) return null // un salto a otro sitio: no se juzga
  if (separacionMm < SEPARACION_IDEAL_MM.min) {
    return `Puntada muy cerca de la anterior (${separacionMm.toFixed(0)} mm): demasiadas juntas estrangulan el borde. Lo habitual en piel es de 5 a 10 mm.`
  }
  if (separacionMm > SEPARACION_IDEAL_MM.max) {
    return `Puntada muy separada de la anterior (${separacionMm.toFixed(0)} mm): entre puntadas tan abiertas el borde se levanta. Lo habitual en piel es de 5 a 10 mm.`
  }
  return null
}

/** Los hilos del catálogo: calibre y color. Es la apariencia, no una regla clínica. */
export interface HiloDeSutura {
  /** Grosor del hilo en mm, ya exagerado para verse (los reales miden de 0,1 a 0,4 mm). */
  grosorMm: number
  /** Color del hilo, 0xRRGGBB. */
  color: number
  nombre: string
}

const HILOS: Readonly<Record<string, HiloDeSutura>> = {
  'sutura-vicryl-2-0': { grosorMm: 0.9, color: 0x6a4cb0, nombre: 'Vicryl 2-0' },
  'sutura-vicryl-3-0': { grosorMm: 0.75, color: 0x7b5fc4, nombre: 'Vicryl 3-0' },
  'sutura-nylon-3-0': { grosorMm: 0.7, color: 0x14141a, nombre: 'Nylon 3-0' },
  'sutura-monocryl-5-0': { grosorMm: 0.5, color: 0xd8c9a0, nombre: 'Monocryl 5-0' },
}

/** Qué hilo es un instrumento, o `null` si no es una sutura. */
export function hiloDelInstrumento(i: { slug?: string | null; nombre: string }): HiloDeSutura | null {
  const conocido = i.slug ? HILOS[i.slug] : undefined
  if (conocido) return conocido
  // Una sutura creada a mano: se reconoce por el nombre y se pinta con lo que diga.
  if (!/sutura|hilo|nylon|vicryl|monocryl|prolene|seda/i.test(i.nombre)) return null
  const oscuro = /nylon|prolene|seda/i.test(i.nombre)
  return { grosorMm: 0.75, color: oscuro ? 0x14141a : 0x6a4cb0, nombre: i.nombre }
}
