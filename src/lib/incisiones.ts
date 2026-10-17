/**
 * Varias incisiones en una misma capa, y qué hacer con un trazo nuevo (P-003 E4).
 *
 * Hasta aquí cada capa tenía **una** herida: un trazo nuevo cerraba la anterior («un trazo nuevo es una incisión
 * nueva»), y por eso un segundo abordaje en la piel borraba el primero. Cristóbal pidió lo contrario: más de un
 * abordaje en la misma cirugía, y cortes discontinuos que se unen y quedan abiertos. Esto es la parte que se prueba
 * sin `three`: dado un trazo nuevo y las incisiones que ya hay en su capa, decide si es **otra** incisión o si
 * **alarga** una.
 *
 * Un trazo alarga una incisión cuando arranca o termina a menos de `UMBRAL_PARA_ALARGAR_MM` de uno de sus extremos:
 * es el gesto de abrir en dos tiempos (empezar donde terminó el corte anterior). Si no toca ninguna, es otra.
 */

export type Punto = readonly [number, number, number]

export interface TrazoDeIncision {
  puntos: Punto[]
  normales: Punto[]
}

/** A cuántos milímetros del extremo de una incisión tiene que empezar un trazo para considerarse su continuación. */
export const UMBRAL_PARA_ALARGAR_MM = 5

const distancia = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * Une el trazo nuevo a una incisión que ya existe, si alguno de sus extremos queda a menos de `umbral` (en las
 * mismas unidades que los puntos) de un extremo de ella. Devuelve la incisión alargada, en el orden en que se dibuja
 * —de un extremo al otro, sin invertir el sentido de la que ya estaba salvo que haga falta—, o `null` si no se tocan.
 *
 * Se elige el par de extremos **más cercano**: un trazo en U cuyos dos extremos tocan la incisión se une por el que
 * esté más cerca, no por el primero que se mire. El punto donde se unen no se repite.
 */
export function alargarIncision(base: TrazoDeIncision, nuevo: TrazoDeIncision, umbral: number): TrazoDeIncision | null {
  if (base.puntos.length < 2 || nuevo.puntos.length < 2) return null
  const a0 = base.puntos[0]
  const a1 = base.puntos[base.puntos.length - 1]
  const b0 = nuevo.puntos[0]
  const b1 = nuevo.puntos[nuevo.puntos.length - 1]
  const opciones = [
    { d: distancia(a1, b0), orden: 'base-nuevo' as const },
    { d: distancia(a1, b1), orden: 'base-nuevoAlReves' as const },
    { d: distancia(a0, b1), orden: 'nuevo-base' as const },
    { d: distancia(a0, b0), orden: 'nuevoAlReves-base' as const },
  ].sort((x, y) => x.d - y.d)
  const mejor = opciones[0]
  if (mejor.d > umbral) return null

  const alReves = (t: TrazoDeIncision): TrazoDeIncision => ({ puntos: [...t.puntos].reverse(), normales: [...t.normales].reverse() })
  // El extremo que se une se quita del trazo que llega: ya está en el otro, y dos puntos casi pegados solo estorban.
  const sinElPrimero = (t: TrazoDeIncision): TrazoDeIncision => ({ puntos: t.puntos.slice(1), normales: t.normales.slice(1) })
  const unir = (x: TrazoDeIncision, y: TrazoDeIncision): TrazoDeIncision => ({
    puntos: [...x.puntos, ...sinElPrimero(y).puntos],
    normales: [...x.normales, ...sinElPrimero(y).normales],
  })
  switch (mejor.orden) {
    case 'base-nuevo':
      return unir(base, nuevo)
    case 'base-nuevoAlReves':
      return unir(base, alReves(nuevo))
    case 'nuevo-base':
      return unir(nuevo, base)
    case 'nuevoAlReves-base':
      return unir(alReves(nuevo), base)
  }
}

/** Una incisión de las que hay en una capa, para decidir contra cuál se mide un trazo. */
export interface IncisionExistente extends TrazoDeIncision {
  id: number
  capa: string
}

/**
 * Qué incisión alarga un trazo nuevo, si alarga alguna: de las de su misma capa, la que tenga el extremo más
 * cercano. Devuelve su `id` y la incisión ya unida.
 */
export function incisionQueAlarga(
  existentes: readonly IncisionExistente[],
  capa: string,
  nuevo: TrazoDeIncision,
  umbral: number,
): { id: number; unida: TrazoDeIncision } | null {
  let mejor: { id: number; unida: TrazoDeIncision; d: number } | null = null
  for (const e of existentes) {
    if (e.capa !== capa) continue
    const unida = alargarIncision(e, nuevo, umbral)
    if (!unida) continue
    const a0 = e.puntos[0]
    const a1 = e.puntos[e.puntos.length - 1]
    const b0 = nuevo.puntos[0]
    const b1 = nuevo.puntos[nuevo.puntos.length - 1]
    const d = Math.min(distancia(a0, b0), distancia(a0, b1), distancia(a1, b0), distancia(a1, b1))
    if (!mejor || d < mejor.d) mejor = { id: e.id, unida, d }
  }
  return mejor ? { id: mejor.id, unida: mejor.unida } : null
}

/** Lo que el panel «Incisiones» dice de cada una: «Incisión 2 · músculo · 30 mm». */
export interface ResumenDeIncision {
  id: number
  capa: 'piel' | 'musculo'
  largoMm: number
  aperturaMm: number
}

/** El texto de una incisión en el panel, con su número de orden (1, 2…) y no su `id` interno. */
export function rotuloDeLaIncision(orden: number, r: Pick<ResumenDeIncision, 'capa' | 'largoMm' | 'aperturaMm'>): string {
  const capa = r.capa === 'piel' ? 'piel' : 'músculo'
  const abierta = r.aperturaMm >= 1 ? ` · abierta ${Math.round(r.aperturaMm)} mm` : ''
  return `Incisión ${orden} · ${capa} · ${Math.round(r.largoMm)} mm${abierta}`
}
