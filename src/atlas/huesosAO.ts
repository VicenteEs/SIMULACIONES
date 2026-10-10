/**
 * Qué pieza del atlas es qué hueso de la clasificación AO (D-161, E4; D-168).
 *
 * El atlas conoce identificadores (`FJ3387`) y la clasificación, huesos (la
 * tibia). Esta tabla es el puente, a mano y corta a propósito: los huesos
 * largos de la v1 y, desde D-168, la clavícula y los huesos pequeños de la mano
 * y del pie. Una prueba (`huesosAO.test.ts`) comprueba contra el catálogo real
 * que cada identificador existe, es un hueso y se llama como dice la tabla;
 * regenerar el atlas con identificadores nuevos se oye ahí y no en el taller.
 *
 * Un tipo de hueso puede tener **varias piezas por lado**: los cinco
 * metacarpianos son cinco piezas del atlas y un solo hueso para la tabla de AO.
 *
 * Quedan fuera, a propósito: la rótula (`FJ3381` / `FJ3275`), la escápula
 * (`FJ3384` / `FJ3279`), el astrágalo (`FJ3385` / `FJ3280`) y el calcáneo
 * (`FJ3360` / `FJ3256`). La rótula, la escápula y el calcáneo se clasifican por
 * lo que pasa en la superficie articular, y el asistente todavía no sabe
 * dibujarla; se revisan con el traumatólogo (E4-Q1).
 */

import type { HuesoAO } from './clasificacionAO'

export type LadoDelHueso = 'derecho' | 'izquierdo'

interface PiezasDelHueso {
  /** El derecho del paciente, que en el atlas está en x negativa. */
  derecho: readonly string[]
  izquierdo: readonly string[]
}

const TABLA: Record<HuesoAO, PiezasDelHueso> = {
  humero: { derecho: ['FJ3368'], izquierdo: ['FJ3262'] },
  radio: { derecho: ['FJ3349'], izquierdo: ['FJ3277'] },
  cubito: { derecho: ['FJ3391'], izquierdo: ['FJ3286'] },
  femur: { derecho: ['FJ3365'], izquierdo: ['FJ3259'] },
  tibia: { derecho: ['FJ3387'], izquierdo: ['FJ3282'] },
  peroneo: { derecho: ['FJ3366'], izquierdo: ['FJ3260'] },
  clavicula: { derecho: ['FJ3362'], izquierdo: ['FJ3237'] },
  // Del primero al quinto.
  metacarpiano: {
    derecho: ['FJ3350', 'FJ3352', 'FJ3354', 'FJ3356', 'FJ3358'],
    izquierdo: ['FJ3240', 'FJ3243', 'FJ3246', 'FJ3249', 'FJ3252'],
  },
  metatarsiano: {
    derecho: ['FJ3351', 'FJ3353', 'FJ3355', 'FJ3357', 'FJ3359'],
    izquierdo: ['FJ3241', 'FJ3244', 'FJ3247', 'FJ3250', 'FJ3253'],
  },
  // Primero las proximales, luego las medias y al final las distales; dentro de
  // cada grupo, del pulgar al meñique (la mano) y del dedo gordo al pequeño (el pie).
  falange_mano: {
    derecho: ['FJ3327', 'FJ3322', 'FJ3325', 'FJ3326', 'FJ3323', 'FJ3303', 'FJ3306', 'FJ3292', 'FJ3304', 'FJ3198', 'FJ3193', 'FJ3196', 'FJ3197', 'FJ3194'],
    izquierdo: ['FJ3318', 'FJ3313', 'FJ3316', 'FJ3317', 'FJ3314', 'FJ3296', 'FJ3299', 'FJ3291', 'FJ3297', 'FJ3188', 'FJ3183', 'FJ3186', 'FJ3187', 'FJ3184'],
  },
  falange_pie: {
    derecho: ['FJ3310', 'FJ3319', 'FJ3320', 'FJ3321', 'FJ3324', 'FJ3300', 'FJ3301', 'FJ3302', 'FJ3305', 'FJ3192', 'FJ3189', 'FJ3190', 'FJ3191', 'FJ3195'],
    izquierdo: ['FJ3329', 'FJ3328', 'FJ3311', 'FJ3312', 'FJ3315', 'FJ3293', 'FJ3294', 'FJ3295', 'FJ3298', 'FJ3182', 'FJ3179', 'FJ3180', 'FJ3181', 'FJ3185'],
  },
}

/** Todas las piezas de un hueso en un lado (los cinco metacarpianos, las catorce falanges…). */
export function piezasDelHueso(hueso: HuesoAO, lado: LadoDelHueso): readonly string[] {
  return TABLA[hueso][lado]
}

/** La primera pieza de un hueso en un lado. Para los huesos de una sola pieza es **la** pieza. */
export function piezaDelHueso(hueso: HuesoAO, lado: LadoDelHueso): string {
  return TABLA[hueso][lado][0]
}

/** Todas las piezas que el asistente sabe fracturar, con su hueso y su lado. */
export const PIEZAS_FRACTURABLES: ReadonlyMap<string, { hueso: HuesoAO; lado: LadoDelHueso }> = new Map(
  (Object.entries(TABLA) as [HuesoAO, PiezasDelHueso][]).flatMap(([hueso, piezas]) =>
    (['derecho', 'izquierdo'] as const).flatMap((lado) =>
      piezas[lado].map((id) => [id, { hueso, lado }] as [string, { hueso: HuesoAO; lado: LadoDelHueso }]),
    ),
  ),
)

/**
 * El rayo o el dedo de una pieza, como lo escribe el compendio AO/OTA 2018 (D-169):
 * `3` para el tercer metacarpiano, `2.1` para la falange proximal del segundo dedo
 * (dedo y falange, separados por un punto). `null` si la pieza no es de un hueso
 * que lleve identificador.
 *
 * Sale de la posición de la pieza en `TABLA`, que está ordenada a propósito. Los
 * cinco metacarpianos y metatarsianos, del primero al quinto. Las catorce falanges,
 * en tres tandas: las cinco proximales, las cuatro medias (el pulgar y el dedo gordo
 * no tienen) y las cinco distales.
 */
export function identificadorDeLaPieza(id: string): string | null {
  const raiz = id.includes('#') ? id.slice(0, id.indexOf('#')) : id
  const info = PIEZAS_FRACTURABLES.get(raiz)
  if (!info) return null
  const lista = TABLA[info.hueso][info.lado]
  const indice = lista.indexOf(raiz)
  if (indice < 0) return null
  if (info.hueso === 'metacarpiano' || info.hueso === 'metatarsiano') return String(indice + 1)
  if (info.hueso === 'falange_mano' || info.hueso === 'falange_pie') {
    // Proximales (0–4): dedos 1 a 5. Medias (5–8): dedos 2 a 5. Distales (9–13): dedos 1 a 5.
    if (indice < 5) return `${indice + 1}.1`
    if (indice < 9) return `${indice - 5 + 2}.2`
    return `${indice - 9 + 1}.3`
  }
  return null
}

/**
 * De un identificador del atlas, el hueso y el lado, o `null` si no es un hueso
 * que se sepa fracturar. Acepta también un fragmento (`FJ3387#a`): es de la misma
 * pieza.
 */
export function huesoDeLaPieza(id: string): { hueso: HuesoAO; lado: LadoDelHueso } | null {
  const raiz = id.includes('#') ? id.slice(0, id.indexOf('#')) : id
  return PIEZAS_FRACTURABLES.get(raiz) ?? null
}
