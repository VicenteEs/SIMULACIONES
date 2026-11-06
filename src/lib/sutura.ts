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

import type { PlanoBlando } from './planosBlandos'

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
  /**
   * En qué plano de partes blandas se picó: el de la pieza que se tocó (P-006, E11). Es lo que dice qué herida cierra la
   * puntada y si el hilo va en ese plano. Ausente en lo guardado antes de que hubiera planos: se toma por la piel.
   */
  plano?: PlanoBlando
  /**
   * El hilo de la línea de esta puntada (P-013, pedido 16). Antes la sutura entera tenía un solo hilo y cambiarlo a mitad
   * repintaba todas las puntadas con el nuevo: la fascia cerrada con Vicryl se volvía negra al pasar al nailon de la piel.
   * Ausente en lo guardado antes: el de la sutura.
   */
  hilo?: HiloDeSutura
  /** La puso «Cerrar el plano», de un clic, y no quien cose (P-013, pedido 16): su separación no se juzga una a una. */
  asistida?: boolean
  /**
   * Dónde se picó. `punto` es dónde está **ahora**: al tirar del hilo el labio de la herida se mueve y se
   * lleva la puntada con él (D-171), y las medidas de la sutura se hacen con el sitio donde se picó, no con
   * el que queda al apretar.
   */
  base?: Vec3
  /** Cómo sigue la puntada al labio de la herida cuando este se mueve. */
  ref?: {
    /** La malla cortada en la que se picó (su `uuid`). */
    malla: string
    /** Hacia dónde se separa el labio, en el mundo. */
    dir: Vec3
    lado: 1 | -1
    /** Cuánto del movimiento del labio le llega a la puntada: 1 en el borde, menos cuanto más lejos. */
    peso: number
    /**
     * Dónde cae la puntada a lo largo de la herida, de 0 a 1. Con separadores colocados la herida no abre
     * igual en todo su largo, y la puntada sigue lo que abre el labio en su sitio. Ausente en lo guardado antes.
     */
    t?: number
    /** Cuánto estaba abierto cada labio al picar, en ese sitio. */
    mas0: number
    menos0: number
  }
}

/** Entre qué separaciones una puntada de piel se considera bien puesta, en mm. */
export const SEPARACION_IDEAL_MM = { min: 5, max: 10 }

/** El mismo rango, que cambia con el plano (P-006, E11): la fascia se cose con puntos más separados que la piel. */
export interface SeparacionIdeal {
  min: number
  max: number
}

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
export function medirLaSutura(
  puntos: readonly PuntoDeSutura[],
  milimetrosPorUnidad: number,
  ideal: SeparacionIdeal = SEPARACION_IDEAL_MM,
): MedidaDeLaSutura {
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
    bienEspaciadas: separacionesMm.filter((s) => s >= ideal.min && s <= ideal.max).length,
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
export function cierreDeLaHerida(cruces: number, largoDeLaHeridaMm: number, tramoMm: number = SEPARACION_IDEAL_MM.max): number {
  if (!(largoDeLaHeridaMm > 0) || cruces <= 0) return 0
  return Math.min(1, (cruces * tramoMm) / largoDeLaHeridaMm)
}

/**
 * Lo que de verdad se cierra: lo que las puntadas permiten, por lo que se ha tirado del hilo.
 *
 * Con el hilo flojo (tensión 0) la herida sigue abierta aunque las puntadas ya crucen: coser y tirar son dos
 * gestos (D-171). Antes cada puntada cruzada cerraba su tramo en el momento, sin que nada se tirara.
 */
export function cierreConTension(
  cruces: number,
  largoDeLaHeridaMm: number,
  tension: number,
  tramoMm: number = SEPARACION_IDEAL_MM.max,
): number {
  return cierreDeLaHerida(cruces, largoDeLaHeridaMm, tramoMm) * traccionDelHilo(tension)
}

// ----------------------------------------------------------------------------------------- tensión

/**
 * La tensión con la que la herida queda justo cerrada, de 0 a 1.
 *
 * Tirar del hilo acerca los bordes hasta que se tocan, y de ahí en adelante no hay nada más que acercar: lo que
 * sigue es apretar de más. Con el 80 % de la carrera ya está cerrada; el 20 % restante es margen para pasarse.
 */
export const TENSION_DE_CIERRE = 0.8

/** Por encima de esta tensión el hilo estrangula el borde (isquemia de la piel): se dice y no se aprueba. */
export const TENSION_QUE_ESTRANGULA = 0.92

/** Cuánto de lo que las puntadas pueden cerrar se cierra con esta tensión, de 0 a 1. */
export function traccionDelHilo(tension: number): number {
  if (!(tension > 0)) return 0
  return Math.min(1, tension / TENSION_DE_CIERRE)
}

/**
 * Lo que dice la herida de cómo se tiró del hilo, o `null` si no hay nada que decir (sin cruces, ni se ha tirado).
 *
 * `cierreMaximo` es lo que las puntadas **podrían** cerrar (`cierreDeLaHerida`): con pocos cruces, tirar todo
 * lo que se quiera no cierra más que eso, y decirlo es lo que lleva a quien aprende a poner más puntadas en
 * vez de más fuerza.
 */
export function juicioDeLaTension(p: {
  tension: number
  cruces: number
  cierreMaximo: number
  /** El largo de la herida, en mm, para decir cuántas puntadas faltan. */
  largoMm?: number
  /** Cuánto de herida cubre una puntada en este plano, en mm. Sin él, el de la piel. */
  tramoMm?: number
}): { texto: string; atencion: boolean; estrangula: boolean } | null {
  if (p.cruces <= 0) {
    return p.tension > 0
      ? { texto: 'Ninguna puntada cruza la herida: tirar del hilo no acerca nada. Pique a un lado y otro de la herida.', atencion: true, estrangula: false }
      : null
  }
  if (p.tension <= 0.02) return null
  if (p.tension > TENSION_QUE_ESTRANGULA) {
    return {
      texto: 'Demasiada tensión: el hilo estrangula el borde de la piel y lo deja sin riego. Afloje un poco: basta con que los bordes se toquen.',
      atencion: true,
      estrangula: true,
    }
  }
  if (p.cierreMaximo < 0.95) {
    const pct = Math.round(p.cierreMaximo * 100)
    const faltan = p.largoMm && p.largoMm > 0 ? Math.max(1, Math.ceil((p.largoMm * (1 - p.cierreMaximo)) / (p.tramoMm ?? SEPARACION_IDEAL_MM.max))) : null
    return {
      texto: `Con ${p.cruces} ${p.cruces === 1 ? 'puntada que cruza' : 'puntadas que cruzan'} la herida solo se puede cerrar el ${pct} %: faltan ${faltan ? `unas ${faltan} puntadas más` : 'puntadas'}, no fuerza.`,
      atencion: true,
      estrangula: false,
    }
  }
  if (p.tension < TENSION_DE_CIERRE - 0.05) {
    return { texto: 'El hilo aún está flojo: siga tirando hasta que los bordes se toquen.', atencion: true, estrangula: false }
  }
  // «El borde» y no «la piel»: el mismo juicio vale para la fascia, que desde P-013 se cierra también de un clic (pedido 16).
  return { texto: 'Bordes afrontados: los labios se tocan sin estrangular el borde.', atencion: false, estrangula: false }
}

/** Lo que se dice de la última puntada, o `null` si estuvo bien (o fue la primera). */
export function juicioDeLaPuntada(
  separacionMm: number | null,
  ideal: SeparacionIdeal = SEPARACION_IDEAL_MM,
  /** «piel», «fascia»: para decir de qué plano es lo habitual. */
  plano = 'piel',
): string | null {
  if (separacionMm === null) return null
  if (separacionMm > SEPARACION_MAXIMA_MM) return null // un salto a otro sitio: no se juzga
  if (separacionMm < ideal.min) {
    return `Puntada muy cerca de la anterior (${separacionMm.toFixed(0)} mm): demasiadas juntas estrangulan el borde. Lo habitual en ${plano} es de ${ideal.min} a ${ideal.max} mm.`
  }
  if (separacionMm > ideal.max) {
    return `Puntada muy separada de la anterior (${separacionMm.toFixed(0)} mm): entre puntadas tan abiertas el borde se levanta. Lo habitual en ${plano} es de ${ideal.min} a ${ideal.max} mm.`
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
  /**
   * En qué planos va este hilo (P-006, E11): el Vicryl 2-0 a la fascia, el nailon y el Monocryl a la piel. Sin esta lista (un hilo
   * creado a mano en el panel) va a cualquiera, porque no se juzga lo que no se sabe.
   */
  planos?: readonly PlanoBlando[]
  /**
   * Hilo o corchetes (P-013, pedido 16). Un corchete no es un hilo tendido entre puntadas: cada uno une los dos labios donde
   * cae, y se dibuja como una grapa de acero. Ausente, hilo, que es lo que había.
   */
  tipo?: 'hilo' | 'corchete'
}

const HILOS: Readonly<Record<string, HiloDeSutura>> = {
  // Las suturas absorbibles van a lo profundo; la de 3-0 también al subcutáneo, que cae en el plano de la piel abierta. Las de
  // piel no entran en la fascia (Cristóbal: «el vicryl debe ir a la fascia»).
  'sutura-vicryl-2-0': { grosorMm: 0.9, color: 0x6a4cb0, nombre: 'Vicryl 2-0', planos: ['fascia'] },
  'sutura-vicryl-3-0': { grosorMm: 0.75, color: 0x7b5fc4, nombre: 'Vicryl 3-0', planos: ['fascia', 'piel'] },
  'sutura-nylon-3-0': { grosorMm: 0.7, color: 0x14141a, nombre: 'Nylon 3-0', planos: ['piel'] },
  'sutura-monocryl-5-0': { grosorMm: 0.5, color: 0xd8c9a0, nombre: 'Monocryl 5-0', planos: ['piel'] },
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
