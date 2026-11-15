/**
 * Cuánto se abre sola una herida al cortarla (P-015).
 *
 * Pedido del dueño, 2026-11-15: «quiero que cuando se corte piel, fascias, músculos, etc. se puedan retraer como en la
 * realidad y no se coloque como cristal; por lo general la tensión y arqueo normal de la piel». Hasta entonces un corte
 * dejaba los dos labios pegados y había que pintarle una cinta roja encima para que se viera.
 *
 * No es `retraccion.ts`, que aparta un músculo **entero** con una hoja (P-004 E5): esto es lo que hacen los dos labios
 * de un corte sin que nadie los toque. Es aritmética y nada más, sin `three`, para probarla sin navegador; quien la
 * aplica a la malla es `corteDeMalla.ts` (`reposo`) a través de `heridas.ts`.
 *
 * Los números no salen de una tabla —no la hay: lo que se abre una incisión depende de la zona, de la edad, de cuánta
 * grasa hay debajo y de cómo cruza las líneas de tensión de la piel—. Son lo que se ve en pabellón, redondeado:
 *
 * - **La piel** es lo que más se abre. Está tensa en todas direcciones y, cortada con su grasa, una incisión de cinco
 *   centímetros en una pierna queda en un ojal de seis a ocho milímetros.
 * - **La fascia profunda** se abre menos: es una lámina fibrosa, tensa pero poco elástica. Unos milímetros.
 * - **El músculo** depende de cómo se lo corte. Abierto **a lo largo** de sus fibras apenas se separa: las fibras
 *   siguen enteras a los dos lados. Cortado **a través**, cada fibra partida se encoge hacia su inserción y los dos
 *   cabos se apartan de verdad. Lo mismo un tendón, un vaso o un nervio seccionados, que van en el mismo plano.
 *
 * Todo crece con el largo de la incisión hasta un tope: una punción de un centímetro no se abre como un abordaje.
 */

import { PENDIENTE_MAXIMA_EN_LA_PUNTA } from './corteDeMalla'
import type { PlanoBlando } from './planosBlandos'

export { PENDIENTE_MAXIMA_EN_LA_PUNTA }

/** Lo que se retrae cada labio por cada milímetro de incisión, y hasta dónde, en milímetros. */
interface ReglaDeRetraccion {
  porMilimetro: number
  topeMm: number
}

export const RETRACCION_DE_LA_PIEL: ReglaDeRetraccion = { porMilimetro: 0.07, topeMm: 3.5 }
export const RETRACCION_DE_LA_FASCIA: ReglaDeRetraccion = { porMilimetro: 0.04, topeMm: 2 }
/** El músculo abierto a lo largo de sus fibras: el menor de los tres. Tiene que quedar por debajo de la fascia, o su herida no se vería por la de ella. */
export const RETRACCION_DEL_MUSCULO_A_LO_LARGO: ReglaDeRetraccion = { porMilimetro: 0.03, topeMm: 1.2 }
/** El músculo cortado a través: las fibras partidas se encogen. */
export const RETRACCION_DEL_MUSCULO_A_TRAVES: ReglaDeRetraccion = { porMilimetro: 0.12, topeMm: 5 }

/**
 * El tramo de cada punta en que el huso se cierra, en milímetros. Una incisión de hasta el doble de esto es un solo
 * arco de punta a punta; una más larga abre pareja en el medio y se cierra en sus últimos tres centímetros.
 */
export const PUNTA_DEL_HUSO_MM = 30

const aplicar = (regla: ReglaDeRetraccion, largoMm: number) => Math.min(regla.topeMm, regla.porMilimetro * Math.max(0, largoMm))

/**
 * Lo que se retrae solo cada labio de una incisión de `largoMm` en ese plano, en milímetros, en lo más ancho.
 *
 * `aTraves` solo cuenta en el plano muscular: de 0 (la incisión va a lo largo de las fibras) a 1 (las cruza en ángulo
 * recto). Es el cuadrado del seno del ángulo entre las dos (`cuantoCruzaLasFibras`).
 */
export function retraccionDelLabioMm(plano: PlanoBlando, largoMm: number, aTraves = 0): number {
  if (!(largoMm > 0)) return 0
  if (plano === 'piel') return aplicar(RETRACCION_DE_LA_PIEL, largoMm)
  if (plano === 'fascia') return aplicar(RETRACCION_DE_LA_FASCIA, largoMm)
  const k = Math.min(1, Math.max(0, aTraves))
  const aLoLargo = aplicar(RETRACCION_DEL_MUSCULO_A_LO_LARGO, largoMm)
  return aLoLargo + (aplicar(RETRACCION_DEL_MUSCULO_A_TRAVES, largoMm) - aLoLargo) * k
}

/**
 * Cuánto cruza una incisión las fibras de un músculo: 0 si va a lo largo de ellas, 1 si las corta en ángulo recto. Las
 * dos direcciones van en el mismo espacio y no hace falta que sean unitarias ni que traigan un sentido: el eje de un
 * músculo no tiene delante ni detrás. Sin una de las dos —un músculo sin eje, un trazo sin largo— no cruza nada.
 */
export function cuantoCruzaLasFibras(incision: readonly [number, number, number], fibras: readonly [number, number, number]): number {
  const li = Math.hypot(incision[0], incision[1], incision[2])
  const lf = Math.hypot(fibras[0], fibras[1], fibras[2])
  if (li < 1e-12 || lf < 1e-12) return 0
  const coseno = (incision[0] * fibras[0] + incision[1] * fibras[1] + incision[2] * fibras[2]) / (li * lf)
  return Math.min(1, Math.max(0, 1 - coseno * coseno))
}

/** La fracción del largo que tarda el huso en abrirse del todo desde cada punta: lo que pide `huso` de `corteDeMalla.ts`. */
export function puntaDelHuso(largoMm: number): number {
  if (!(largoMm > 0)) return 0.5
  return Math.min(0.5, PUNTA_DEL_HUSO_MM / largoMm)
}

/**
 * Lo más que puede retraerse cada labio de una grieta de `largoMm` que se cierra al menos por una punta, en milímetros.
 *
 * La retracción sale del largo de la **incisión** —es lo que decide cuánto se abre la herida—, pero cada malla la sufre
 * sobre su propia **grieta**. En la piel las dos miden casi lo mismo; en una vena que el trazo de cuatro centímetros cruza
 * de través, la grieta es de un milímetro: abierta los 4,7 mm que pide ese trazo a través de las fibras, el huso pasaba de
 * cero a todo en medio milímetro y plegaba 33 triángulos (P-015, medido en el caso 4). El huso (`husoDeLaGrieta`) sube
 * como u(2 − u) a lo largo del tramo de su punta, con pendiente 2/tramo al empezar, así que la retracción no puede pasar
 * de PENDIENTE · tramo / 2. Es también lo que se ve: un corte corto no se abre como uno largo.
 *
 * Una grieta abierta por las dos puntas —el vaso partido de lado a lado, que ya no tiene tejido entero que la cierre—
 * no tiene huso: sus cabos se apartan enteros y no hay tope (`Infinity`).
 */
export function topeDeLaRetraccionMm(largoDeLaGrietaMm: number, conPunta: boolean): number {
  if (!conPunta) return Infinity
  if (!(largoDeLaGrietaMm > 0)) return 0
  const tramo = puntaDelHuso(largoDeLaGrietaMm) * largoDeLaGrietaMm
  return (PENDIENTE_MAXIMA_EN_LA_PUNTA * tramo) / 2
}

/**
 * Lo que tarda la herida en abrirse al cortarla, en milisegundos. La piel no espera: se aparta detrás de la hoja. Es
 * corto a propósito —lo justo para que se vea que el tejido se va y no que la herida «aparece» abierta—, y más largo
 * haría esperar a quien ya tiene el separador en la mano.
 */
export const DURACION_DE_LA_RETRACCION_MS = 320

/** Cómo avanza la retracción con el tiempo, de 0 a 1: rápida al soltarse y frenando, como algo elástico que cede. */
export const avanceDeLaRetraccion = (k: number): number => {
  const x = Math.min(1, Math.max(0, k))
  return 1 - (1 - x) ** 3
}
