/**
 * Los planos de partes blandas del simulador: la piel, la fascia y el músculo (P-006, E10).
 *
 * Hasta las fascias había dos planos de herida, `piel` y `musculo`, y el bisturí profundo cortaba «lo de debajo» como
 * una masa. Cristóbal lo dijo después de operar: «es crítico incluir la fascia dentro de los planos», y al cerrar,
 * «el vicryl debe ir a la fascia». La fascia es un plano más, entre los dos, con su herida, su capa en la consola y su
 * lugar en el cierre.
 *
 * Es puro y sin `three`: lo leen el lienzo, la consola, los separadores y las pruebas, y las cuentas de qué plano corta
 * un gesto son lo que se puede equivocar sin que se note (el trazo que corta el músculo con la fascia intacta encima).
 */

import { esEstructuraNoble } from './piezasDelCaso'

/** De la superficie hacia dentro: la piel, la fascia que la cubre por debajo, y el músculo. */
export type PlanoBlando = 'piel' | 'fascia' | 'musculo'

export const PLANOS_BLANDOS: readonly PlanoBlando[] = ['piel', 'fascia', 'musculo']

/** Cuántos planos hay por encima: 0 la piel, 1 la fascia, 2 el músculo. Sirve para decir «este y todos los de encima». */
export const PROFUNDIDAD_DEL_PLANO: Readonly<Record<PlanoBlando, number>> = { piel: 0, fascia: 1, musculo: 2 }

/** Cómo se llama el plano cuando se habla de su herida: el panel dice «Piel y Fascia», no «piel y fascia». */
export const NOMBRE_DEL_PLANO: Readonly<Record<PlanoBlando, string>> = {
  piel: 'Piel',
  fascia: 'Fascia',
  musculo: 'Planos profundos',
}

/**
 * El plano al que pertenece una pieza por su papel en el caso, o `null` si no es de partes blandas (el hueso).
 *
 * Los vasos y los nervios son del plano muscular (P-012 E6): van entre los músculos, el bisturí profundo los
 * alcanza y la sutura del plano los cubre. Tienen papel propio para que cortarlos cuente, no plano propio.
 */
export function planoDelRol(rol: string | undefined | null): PlanoBlando | null {
  if (rol === 'piel' || rol === 'fascia' || rol === 'musculo') return rol
  if (esEstructuraNoble(rol)) return 'musculo'
  return null
}

export interface EstadoDeLaFascia {
  /** Hay alguna pieza de fascia **visible** en el campo: con la capa apagada, el trazo ni se entera de ella. */
  hayFascia: boolean
  /** Ya hay una herida en la fascia. */
  fasciaAbierta: boolean
}

/**
 * Qué plano corta realmente un trazo de los instrumentos «profundos» (bisturí N.º 15, electrobisturí, tijeras).
 *
 * Esos instrumentos cortan «lo que hay bajo la piel» (`musculo`), pero **la fascia está en medio**: con ella intacta no
 * se llega al músculo. El primer trazo profundo abre la fascia y el segundo, el músculo; es lo que se hace en pabellón y
 * lo que deja que el cierre vaya por planos. Sin fascia visible (un caso viejo, o la capa apagada), el trazo profundo
 * corta el músculo como siempre.
 */
export function planoQueCorta(pedido: PlanoBlando, fascia: EstadoDeLaFascia): { plano: PlanoBlando; redirigido: boolean } {
  if (pedido === 'musculo' && fascia.hayFascia && !fascia.fasciaAbierta) return { plano: 'fascia', redirigido: true }
  return { plano: pedido, redirigido: false }
}

/** Qué se le dice a quien trazó para llegar al músculo y abrió la fascia. */
export const AVISO_DE_LA_FASCIA =
  'Se cortó la fascia, que cubre al músculo: sin abrirla no se llega a él. Vuelva a trazar para entrar en el plano muscular.'
