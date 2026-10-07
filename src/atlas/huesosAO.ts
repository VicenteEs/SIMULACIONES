/**
 * Qué pieza del atlas es qué hueso de la clasificación AO (D-161, E4).
 *
 * El atlas conoce identificadores (`FJ3387`) y la clasificación, huesos (la
 * tibia). Esta tabla es el puente, a mano y corta a propósito: solo los huesos
 * largos de la v1. Una prueba (`huesosAO.test.ts`) comprueba contra el catálogo
 * real que cada identificador existe, es un hueso y se llama como dice la tabla;
 * regenerar el atlas con identificadores nuevos se oye ahí y no en el taller.
 *
 * Más adelante (v2), con sus identificadores ya medidos: clavícula `FJ3362` /
 * `FJ3237`, escápula `FJ3384` / `FJ3279`, rótula `FJ3381` / `FJ3275`,
 * metacarpianos `FJ3350`–`FJ3358` / `FJ3240`–`FJ3252`, astrágalo `FJ3385` /
 * `FJ3280` y calcáneo `FJ3360` / `FJ3256`.
 */

import type { HuesoAO } from './clasificacionAO'

export type LadoDelHueso = 'derecho' | 'izquierdo'

/** Derecho, izquierdo: el derecho del paciente, que en el atlas está en x negativa. */
const TABLA: Record<HuesoAO, readonly [string, string]> = {
  humero: ['FJ3368', 'FJ3262'],
  radio: ['FJ3349', 'FJ3277'],
  cubito: ['FJ3391', 'FJ3286'],
  femur: ['FJ3365', 'FJ3259'],
  tibia: ['FJ3387', 'FJ3282'],
  peroneo: ['FJ3366', 'FJ3260'],
}

/** La pieza de un hueso en un lado. */
export function piezaDelHueso(hueso: HuesoAO, lado: LadoDelHueso): string {
  return TABLA[hueso][lado === 'derecho' ? 0 : 1]
}

/** Todas las piezas que el asistente sabe fracturar, con su hueso y su lado. */
export const PIEZAS_FRACTURABLES: ReadonlyMap<string, { hueso: HuesoAO; lado: LadoDelHueso }> = new Map(
  (Object.entries(TABLA) as [HuesoAO, readonly [string, string]][]).flatMap(([hueso, [derecha, izquierda]]) => [
    [derecha, { hueso, lado: 'derecho' }] as [string, { hueso: HuesoAO; lado: LadoDelHueso }],
    [izquierda, { hueso, lado: 'izquierdo' }] as [string, { hueso: HuesoAO; lado: LadoDelHueso }],
  ]),
)

/**
 * De un identificador del atlas, el hueso y el lado, o `null` si no es un hueso
 * que se sepa fracturar. Acepta también un fragmento (`FJ3387#a`): es de la misma
 * pieza.
 */
export function huesoDeLaPieza(id: string): { hueso: HuesoAO; lado: LadoDelHueso } | null {
  const raiz = id.includes('#') ? id.slice(0, id.indexOf('#')) : id
  return PIEZAS_FRACTURABLES.get(raiz) ?? null
}
