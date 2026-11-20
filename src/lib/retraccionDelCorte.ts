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
 *   centímetros a lo largo de una pierna queda en un ojal de seis a ocho milímetros. No igual en todas, sin embargo
 *   (D-422): tira más a lo largo de sus líneas de tensión, y la incisión que las cruza se abre el doble.
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

/** La piel abierta a lo largo de sus líneas de tensión: la incisión de un abordaje de la pierna, que es lo que se ve en pabellón. */
export const RETRACCION_DE_LA_PIEL: ReglaDeRetraccion = { porMilimetro: 0.07, topeMm: 3.5 }
/**
 * La piel cortada a través de sus líneas de tensión (D-422): el doble. Hasta D-422 la piel se abría igual en cualquier
 * dirección, y una incisión transversal de la pierna quedaba tan cerrada como la del abordaje, que va a lo largo; la
 * herida transversal de la espinilla es justamente la que más se abre. Lo que se sabe:
 *
 * - La piel viva está estirada de antemano, y más a lo largo de sus líneas que a través. Extirpada, se encoge un 23 % a
 *   lo largo y un 10 % a través (Destrade y otros, en perro, Skin Res Technol 2017): lo que estaba estirado es 0,30
 *   frente a 0,11, casi el triple.
 * - Una herida que cruza esas líneas se retrae más que una paralela a ellas, y pide más tensión para cerrarla (piel de
 *   cerdo, Plast Reconstr Surg 1977). Langer, que las dibujó pinchando cadáveres, veía el agujero redondo de un punzón
 *   quedar en un ojal a lo largo de ellas.
 * - En la pierna van a lo largo: cerrar en vertical pide menos tensión que cerrar en cualquier otra dirección (Paul y
 *   otros, 2018, medido con tensiómetro en 23 heridas de la extremidad inferior). Es lo que el lienzo toma por eje
 *   (`cuantoCruzaLaTension`).
 *
 * El doble y no el triple: la pierna es un tubo y la piel también tira alrededor de él, y con el triple un corte
 * transversal de cuatro centímetros ya se abría lo que su punta tolera (`topeDeLaRetraccionMm`). En medio se mezcla
 * como el músculo, por el cuadrado del seno: lo que tira de través sobre la línea del corte.
 */
export const RETRACCION_DE_LA_PIEL_A_TRAVES: ReglaDeRetraccion = { porMilimetro: 0.14, topeMm: 7 }
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
 * `aTraves` es cuánto cruza la incisión lo que tensa ese plano, de 0 (va a lo largo) a 1 (lo cruza en ángulo recto): en
 * el músculo, sus fibras; en la piel, sus líneas de tensión (D-422). Es el cuadrado del seno del ángulo entre las dos
 * (`cuantoCruzaLasFibras`). La fascia no lo mira: en la pierna la crural tira sobre todo alrededor, al revés que la piel,
 * y sin saberlo de cada fascia vale más abrirla igual en todas.
 */
export function retraccionDelLabioMm(plano: PlanoBlando, largoMm: number, aTraves = 0): number {
  if (!(largoMm > 0)) return 0
  if (plano === 'fascia') return aplicar(RETRACCION_DE_LA_FASCIA, largoMm)
  const k = Math.min(1, Math.max(0, aTraves))
  const [aLo, aTra] = plano === 'piel' ? [RETRACCION_DE_LA_PIEL, RETRACCION_DE_LA_PIEL_A_TRAVES] : [RETRACCION_DEL_MUSCULO_A_LO_LARGO, RETRACCION_DEL_MUSCULO_A_TRAVES]
  const aLoLargo = aplicar(aLo, largoMm)
  return aLoLargo + (aplicar(aTra, largoMm) - aLoLargo) * k
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

/**
 * Desde cuánto alargamiento (`alargamiento` de `aspectoAnatomico.ts`) una piel es la de un miembro, y hasta cuánto
 * todavía no del todo. La piel de un tubo de diámetro D y largo L da 0,82 · L / D —lo largo, repartido parejo, contra
 * un contorno—: un antebrazo de 25 cm y 7 de diámetro, 2,9; un recorte de pierna dos veces más largo que grueso, 1,6.
 * Un trozo de tronco tan largo como ancho, de sección ovalada, da 0,8.
 */
export const ALARGAMIENTO_DE_UN_MIEMBRO = { desde: 1.3, hasta: 1.6 }

/**
 * Cuánto cruza una incisión las líneas de tensión de la piel, de 0 a 1, para `retraccionDelLabioMm` (D-422): en un
 * miembro van a lo largo de él (su `eje`), y se mide como las fibras de un músculo. En una malla que no es un miembro
 * —poco `alargada`— no se sabe hacia dónde van: en el tronco Langer las dibujó de través, al revés que en la pierna. Ahí
 * no cruza nada y la piel se abre como hasta D-422, que es como se abre a lo largo.
 */
export function cuantoCruzaLaTension(incision: readonly [number, number, number], eje: readonly [number, number, number], alargado: number): number {
  const { desde, hasta } = ALARGAMIENTO_DE_UN_MIEMBRO
  const miembro = Math.min(1, Math.max(0, (alargado - desde) / (hasta - desde)))
  return miembro > 0 ? cuantoCruzaLasFibras(incision, eje) * miembro : 0
}

/**
 * Lo que mide de una cresta a la siguiente una arruga de la piel apretada, en milímetros (D-423).
 *
 * La piel que se aprieta no se acorta: se dobla, como una lámina dura sobre una blanda. Una lámina así se arruga con una
 * onda de 2π·t·(E/3E₀)^⅓, con `t` su grosor y `E`, `E₀` lo rígida que es ella y lo que tiene debajo: la dermis, de un
 * milímetro y medio, sobre la grasa, cientos de veces más blanda, da de 20 a 50 mm. Las arrugas finas de la epidermis
 * —décimas de milímetro— no las dibuja una malla de 2 mm, ni se ven desde la distancia del cirujano. Con 20, detrás de
 * un Farabeuf caben una o dos crestas en lo que arrastra (45 mm), que es lo que se ve: un rodete o dos, no un acordeón.
 */
export const ONDA_DE_LAS_ARRUGAS_MM = 20

/**
 * Lo que la piel viva está estirada antes de cortarla, en cada dirección, en fracción de su largo (D-423): lo que se
 * puede apretar sin arrugarse, porque solo devuelve lo que ya tenía de más. Se mide en la dirección en que se aprieta,
 * que es la que cruza el corte: un corte a lo largo de las líneas de tensión aprieta de través, donde la piel está
 * menos estirada (un 10 %), y uno de través aprieta a lo largo de ellas (un 23 %). Es lo que se encoge la piel al
 * extirparla en cada dirección (Destrade y otros, en perro, 2017), la misma fuente de `RETRACCION_DE_LA_PIEL_A_TRAVES`.
 */
export const ESTIRADA_PREVIA_DE_LA_PIEL = { aTraves: 0.1, aLoLargo: 0.23 }

/**
 * Las arrugas de la piel con un corte que cruza sus líneas de tensión lo que dice `cruza`, de 0 a 1
 * (`cuantoCruzaLaTension`): su onda en milímetros y lo que aguanta apretada sin arrugarse (D-423).
 */
export function arrugasDeLaPiel(cruza: number): { ondaMm: number; estiradaPrevia: number } {
  const k = Math.min(1, Math.max(0, cruza))
  const { aTraves, aLoLargo } = ESTIRADA_PREVIA_DE_LA_PIEL
  return { ondaMm: ONDA_DE_LAS_ARRUGAS_MM, estiradaPrevia: aTraves + (aLoLargo - aTraves) * k }
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
