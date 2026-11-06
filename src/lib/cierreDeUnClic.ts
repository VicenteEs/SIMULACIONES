/**
 * El cierre de un clic (P-013, pedido 16 de Cristóbal): «Pondría algo como "cerrar fascia" y que permita elegir el hilo y su
 * diámetro y pinchar la fascia y que quede toda cerrada [...] Elegir el hilo "nylon, monocryl, corchetes" y que al pinchar la
 * piel, que quede cerrado».
 *
 * El cierre por planos de P-006 E11 se cosía puntada a puntada: de nueve a once clics para ocho a diez centímetros de piel, y
 * después tirar del hilo. Es el gesto que se enseña cuando se enseña a suturar, y sigue ahí con los hilos de la mesa; pero al
 * final de una osteosíntesis lo que se practica es la osteosíntesis, y coser cada punto de la herida entera no le enseña nada
 * a quien ya llegó hasta ahí. Aquí está lo que decide **qué hilo** se usa en cada plano y **dónde** van sus puntadas cuando el
 * plano se cierra de una vez. El lienzo las pone sobre los labios y las aprieta lo justo; esto no sabe nada de la escena.
 *
 * Es puro, sin `three`, por lo mismo que `sutura.ts`: son cuentas que fallan sin que se note —un cierre que deja la punta de la
 * herida abierta, unas puntadas que el juicio de separación da por malas— y que se prueban mejor con números.
 *
 * ## Lo que no hay
 *
 * - **El subcutáneo como plano aparte.** En estos modelos la grasa va pegada a la piel, como su cara de dentro (P-012 E8, D-331):
 *   no hay una capa que cerrar entre la fascia y la piel, y cerrar la piel la cierra con ella.
 * - **Puntos por el cierre.** Ningún paso juzga hoy la sutura, y antes de que lo haga hay que acordar qué es un buen cierre.
 */

import { SEPARACION_IDEAL_POR_PLANO } from './planosDeLaSutura'
import { cierreDeLaHerida, type HiloDeSutura } from './sutura'

/** Los planos que se cierran: la fascia, que cierra también el músculo de debajo, y la piel. */
export type PlanoQueSeCierra = 'fascia' | 'piel'

/** Una familia de hilo con sus calibres: «Nylon» con 2-0, 3-0, 4-0 y 5-0. Los corchetes no tienen calibre. */
export interface FamiliaDeHilo {
  clave: string
  nombre: string
  tipo: 'hilo' | 'corchete'
  calibres: readonly string[]
  /** El que se ofrece primero: el habitual en ese plano. `null` en los corchetes. */
  calibrePorDefecto: string | null
  color: number
  /** Lo que se lee al elegirlo: qué es y por qué se usa ahí. */
  descripcion: string
}

/**
 * Lo que se puede elegir en cada plano. Son los de la petición —nailon, Monocryl y corchetes para la piel— y, para la fascia,
 * los dos absorbibles con que se cierra en pabellón. El calibre se elige dentro del hilo y no es un instrumento por calibre: así
 * la mesa no se llena de sobres que solo cambian en un número.
 */
export const HILOS_DEL_CIERRE: Readonly<Record<PlanoQueSeCierra, readonly FamiliaDeHilo[]>> = {
  fascia: [
    {
      clave: 'vicryl',
      nombre: 'Vicryl',
      tipo: 'hilo',
      calibres: ['0', '2-0', '3-0'],
      calibrePorDefecto: '2-0',
      color: 0x6a4cb0,
      descripcion: 'Absorbible trenzado (poliglactina 910), violeta. El de siempre para la fascia.',
    },
    {
      clave: 'pds',
      nombre: 'PDS',
      tipo: 'hilo',
      calibres: ['0', '2-0'],
      calibrePorDefecto: '0',
      color: 0x4b5ea8,
      descripcion: 'Absorbible monofilamento (polidioxanona): sostiene la fascia más tiempo que el Vicryl.',
    },
  ],
  piel: [
    {
      clave: 'nylon',
      nombre: 'Nylon',
      tipo: 'hilo',
      calibres: ['2-0', '3-0', '4-0', '5-0'],
      calibrePorDefecto: '3-0',
      color: 0x14141a,
      descripcion: 'No absorbible, negro. Los puntos se retiran a las dos semanas.',
    },
    {
      clave: 'monocryl',
      nombre: 'Monocryl',
      tipo: 'hilo',
      calibres: ['3-0', '4-0', '5-0'],
      calibrePorDefecto: '4-0',
      color: 0xd8c9a0,
      descripcion: 'Absorbible monofilamento (poliglecaprona 25). No hay que retirarlo.',
    },
    {
      clave: 'corchetes',
      nombre: 'Corchetes',
      tipo: 'corchete',
      calibres: [],
      calibrePorDefecto: null,
      color: 0xb9bec6,
      descripcion: 'Grapas de acero, con la corchetera. Es lo más rápido; se retiran a las dos semanas.',
    },
  ],
}

/**
 * Grosor con que se **ve** cada calibre, en mm. Los de verdad miden de 0,1 (5-0) a 0,4 mm (0): a la distancia de la cámara no
 * se verían, así que se exageran, con la misma escala que los hilos de la mesa (`sutura.ts`: Vicryl 2-0, 0,9; Monocryl 5-0, 0,5).
 */
const GROSOR_POR_CALIBRE_MM: Readonly<Record<string, number>> = { '0': 1, '2-0': 0.9, '3-0': 0.75, '4-0': 0.6, '5-0': 0.5 }

/** Los corchetes se dibujan con este grosor de alambre, en mm. */
const GROSOR_DEL_CORCHETE_MM = 0.7

/** El hilo que se usa al cerrar un plano con la familia y el calibre elegidos, o `null` si esa familia no es de ese plano. */
export function hiloDelCierre(plano: PlanoQueSeCierra, clave: string, calibre: string | null): HiloDeSutura | null {
  const familia = HILOS_DEL_CIERRE[plano].find((f) => f.clave === clave)
  if (!familia) return null
  if (familia.tipo === 'corchete') {
    return { nombre: familia.nombre, grosorMm: GROSOR_DEL_CORCHETE_MM, color: familia.color, planos: [plano], tipo: 'corchete' }
  }
  const elegido = calibre && familia.calibres.includes(calibre) ? calibre : (familia.calibrePorDefecto ?? familia.calibres[0])
  return {
    nombre: `${familia.nombre} ${elegido}`,
    grosorMm: GROSOR_POR_CALIBRE_MM[elegido] ?? 0.75,
    color: familia.color,
    planos: [plano],
    tipo: 'hilo',
  }
}

/** Una puntada del plan: dónde cae a lo largo de la herida (de 0 a 1), de qué lado, y si abre una línea. */
export interface PuntadaDelPlan {
  t: number
  lado: 1 | -1
  nuevaLinea: boolean
}

/** Ni la primera ni la última puntada van en la misma punta de la herida, que no se abre: van a 3 mm de cada extremo. */
export const MARGEN_DE_LOS_EXTREMOS_MM = 3

/**
 * El paso entre puntadas de un hilo, a lo largo de la herida, como fracción de lo que cierra cada cruce (`SEPARACION_IDEAL_POR_PLANO`,
 * su máximo): 7 mm en piel y 10,5 en fascia. Con el 100 % el cierre quedaba justo, y la punta que no alcanzaba el último cruce se
 * veía abierta; con menos de dos tercios las puntadas caían más cerca que lo habitual, y el juicio de separación las habría
 * dado por juntas.
 */
export const PASO_DEL_HILO = 0.7

/** Un corchete cada 7 mm, que es lo que deja la corchetera de piel al apretarla a lo largo de la herida. */
export const PASO_DE_LOS_CORCHETES_MM = 7

/**
 * Dónde van las puntadas para cerrar entera una herida de `largoMm`.
 *
 * - **Un hilo** es una sutura continua: una sola línea que va de un labio al otro, y cada puntada cruza la herida. Es lo que la
 *   sutura de D-169 ya sabe medir —los cruces, la separación entre puntadas—, así que el cierre de un clic se mide igual que el
 *   cosido a mano.
 * - **Los corchetes** son de a dos puntas, una en cada labio y a la misma altura: cada uno es una línea que cruza una vez.
 *
 * En los dos casos hay cruces de sobra para que `cierreDeLaHerida` llegue a 1: ni la punta de una herida corta se queda abierta.
 */
export function planDelCierre(largoMm: number, plano: PlanoQueSeCierra, tipo: 'hilo' | 'corchete'): PuntadaDelPlan[] {
  if (!(largoMm > 0)) return []
  const tramoMm = SEPARACION_IDEAL_POR_PLANO[plano].max
  const margen = Math.min(MARGEN_DE_LOS_EXTREMOS_MM, largoMm / 4)
  const util = Math.max(0, largoMm - 2 * margen)
  // Los cruces que hacen falta para cerrar todo, por bajo que sea el paso: en una herida corta el margen pesa más.
  const necesarios = Math.max(1, Math.ceil(largoMm / tramoMm))
  const enT = (mm: number) => Math.min(1, Math.max(0, mm / largoMm))
  if (tipo === 'corchete') {
    // Hacia arriba: «cada 7 mm» es lo más que se separan dos corchetes, no lo justo.
    const cuantos = Math.max(necesarios, Math.ceil(util / PASO_DE_LOS_CORCHETES_MM) + 1)
    const salida: PuntadaDelPlan[] = []
    for (let i = 0; i < cuantos; i++) {
      const t = enT(cuantos === 1 ? largoMm / 2 : margen + (util * i) / (cuantos - 1))
      salida.push({ t, lado: 1, nuevaLinea: true }, { t, lado: -1, nuevaLinea: false })
    }
    return salida
  }
  const cruces = Math.max(necesarios, Math.ceil(util / (PASO_DEL_HILO * tramoMm)))
  const salida: PuntadaDelPlan[] = []
  for (let i = 0; i <= cruces; i++) {
    salida.push({ t: enT(margen + (util * i) / cruces), lado: i % 2 === 0 ? 1 : -1, nuevaLinea: i === 0 })
  }
  return salida
}

/** Cuántos cruces tiene un plan: los pares seguidos de una misma línea que caen a lados distintos. */
export function crucesDelPlan(plan: readonly PuntadaDelPlan[]): number {
  let cruces = 0
  for (let i = 1; i < plan.length; i++) {
    if (!plan[i].nuevaLinea && plan[i].lado !== plan[i - 1].lado) cruces += 1
  }
  return cruces
}

/** Lo que cierra un plan con el hilo bien tirado: 1 si cubre la herida entera (`cierreDeLaHerida`). */
export function cierreDelPlan(plan: readonly PuntadaDelPlan[], largoMm: number, plano: PlanoQueSeCierra): number {
  return cierreDeLaHerida(crucesDelPlan(plan), largoMm, SEPARACION_IDEAL_POR_PLANO[plano].max)
}

/** «la fascia», «la piel»: para escribirlo dentro de una frase. */
export const EL_PLANO: Readonly<Record<PlanoQueSeCierra, string>> = { fascia: 'la fascia', piel: 'la piel' }

/** Lo que se dice al cerrar un plano de un clic: cuántas puntadas o corchetes, y de qué. */
export function textoDelCierre(plano: PlanoQueSeCierra, hilo: Pick<HiloDeSutura, 'nombre' | 'tipo'>, puntadas: number, heridas: number): string {
  const que =
    hilo.tipo === 'corchete'
      ? `${puntadas} ${puntadas === 1 ? 'corchete' : 'corchetes'}`
      : `una sutura continua de ${hilo.nombre} (${puntadas} ${puntadas === 1 ? 'puntada' : 'puntadas'})`
  const donde = heridas > 1 ? ` en sus ${heridas} incisiones` : ''
  return `${EL_PLANO[plano][0].toUpperCase()}${EL_PLANO[plano].slice(1)} quedó cerrada con ${que}${donde}.`
}
