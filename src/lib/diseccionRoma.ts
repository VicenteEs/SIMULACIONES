/**
 * La disección roma con la tijera de Metzenbaum (petición de Cristóbal).
 *
 * La Metzenbaum se usa de dos maneras. Cortando, como cualquier tijera, abre la herida por donde pasa la
 * hoja. En disección roma no corta: se mete la **punta cerrada** en el tejido, se **abren las ramas** y el plano
 * se separa por tensión, no por corte; después se avanza, se vuelve a abrir, y así se va abriendo camino entre
 * estructuras delicadas (vasos, nervios) sin lesionarlas. Se hace para llegar a los planos profundos con cuidado.
 *
 * Aquí está la parte que se puede probar sin pantalla: dónde cae la herida que dejan los puntos donde se fue
 * abriendo, y cuánto separan las ramas. Es puro y sin three; el lienzo pone el resto (`LienzoQuirurgico.tsx`).
 *
 * El modelo es deliberadamente sencillo: cada vez que se abren las ramas lo bastante en un punto, ese punto
 * entra en el camino de la disección, y la herida del plano es la línea que pasa por todos los puntos donde se
 * separó. Mientras las ramas están abiertas, el plano se abre en ese punto; al cerrarlas, el plano queda
 * disecado (la herida sigue ahí) pero sus labios vuelven a juntarse.
 */

import type { CapaDeLaHerida } from './exposicion'

type Vec3 = [number, number, number]

export interface NodoDeDiseccion {
  /** Dónde se apoyó la punta, sobre la superficie del plano. */
  punto: Vec3
  /** La normal de la superficie ahí, hacia fuera. */
  normal: Vec3
}

/** Con las ramas abiertas más que esta fracción del recorrido, el plano empieza a separarse (el resto es holgura de la mano). */
export const FRACCION_QUE_SEPARA = 0.12
/** Lo que mide la ranura que deja una sola apertura, en milímetros: el largo de las ramas que entran. */
export const LARGO_DE_LA_RANURA_MM = 12
/** Cada cuántos milímetros se marca un punto de la línea entre dos aperturas. */
export const PASO_DE_LA_LINEA_MM = 3
/** Cuánto se prolonga la herida más allá del primer y el último punto, en milímetros. */
export const PROLONGACION_MM = 4
/** Dos apoyos más cerca que esto son el mismo: la punta no avanzó. */
export const AVANCE_MINIMO_MM = 3

/** ¿Las ramas están lo bastante abiertas como para separar el plano? */
export const separaElPlano = (fraccion: number): boolean => fraccion >= FRACCION_QUE_SEPARA

/**
 * Cuánto se aparta cada labio con las ramas abiertas una fracción de su recorrido. Los dos labios se separan por
 * igual (la tensión es simétrica), y la apertura total es lo que separan las puntas.
 */
export function aperturaPorLabioEnMm(fraccion: number, maximoMm: number): number {
  const f = Math.min(1, Math.max(0, fraccion))
  return (f * maximoMm) / 2
}

/** La capa de partes blandas que corresponde al papel de la pieza tocada, o `null` si no es blanda (el hueso). */
export function capaBlandaDelRol(rol: string | undefined): CapaDeLaHerida | null {
  if (rol === 'piel') return 'piel'
  if (rol === 'musculo') return 'musculo'
  return null
}

const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const suma = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const escala = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const largo = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const unitario = (a: Vec3): Vec3 => {
  const l = largo(a)
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l]
}
const mezcla = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

/**
 * ¿La punta avanzó respecto del último apoyo? `unidadesPorMm` es lo que mide un milímetro en las unidades del
 * mundo. Sin avance, otra apertura se hace en el mismo punto y no añade un nodo.
 */
export function avanzo(anterior: Vec3 | undefined, nuevo: Vec3, unidadesPorMm: number): boolean {
  if (!anterior) return true
  return largo(resta(nuevo, anterior)) >= AVANCE_MINIMO_MM * unidadesPorMm
}

export interface TrazoDeLaDiseccion {
  puntos: Vec3[]
  normales: Vec3[]
  /** Dónde cae cada nodo a lo largo de la línea, de 0 a 1 (el mismo `t` con que la herida los mide). */
  posiciones: number[]
}

/**
 * La línea por donde queda la herida de la disección: pasa por los puntos donde se fue separando.
 *
 * - Con **un** punto es una ranura corta alrededor de él, en la dirección del eje del hueso proyectado sobre la
 *   superficie (`direccionDeLaRanura`): se diseca a lo largo del miembro, no de través.
 * - Con **varios**, es la línea que los une en el orden en que se fueron abriendo, con un punto cada pocos
 *   milímetros y prolongada un poco por los dos extremos para que la herida cubra las puntas.
 *
 * Las normales se interpolan entre las de los nodos. No se vuelven a proyectar sobre la superficie aquí (eso es
 * del lienzo, que tiene las mallas).
 */
export function trazoDeLaDiseccion(
  nodos: readonly NodoDeDiseccion[],
  direccionDeLaRanura: Vec3,
  unidadesPorMm: number,
): TrazoDeLaDiseccion {
  if (nodos.length === 0) return { puntos: [], normales: [], posiciones: [] }
  const paso = PASO_DE_LA_LINEA_MM * unidadesPorMm
  const prolongacion = PROLONGACION_MM * unidadesPorMm

  if (nodos.length === 1) {
    const n = unitario(nodos[0].normal)
    // La dirección de la ranura, pegada a la superficie: se le quita lo que tenga de normal.
    let d = resta(direccionDeLaRanura, escala(n, punto(direccionDeLaRanura, n)))
    if (largo(d) < 1e-9) d = resta([1, 0, 0], escala(n, n[0]))
    d = unitario(d)
    const mitad = (LARGO_DE_LA_RANURA_MM / 2) * unidadesPorMm
    const pasos = Math.max(2, Math.round(mitad / paso))
    const puntos: Vec3[] = []
    for (let i = -pasos; i <= pasos; i++) puntos.push(suma(nodos[0].punto, escala(d, (i / pasos) * mitad)))
    return { puntos, normales: puntos.map(() => n), posiciones: [0.5] }
  }

  // Varios: la línea por los nodos, con un punto cada `paso` y los extremos prolongados.
  const puntos: Vec3[] = [nodos[0].punto]
  const normales: Vec3[] = [unitario(nodos[0].normal)]
  const acumulado: number[] = [0]
  const posicionDeNodo: number[] = [0]
  let total = 0
  for (let i = 1; i < nodos.length; i++) {
    const a = nodos[i - 1]
    const b = nodos[i]
    const tramo = largo(resta(b.punto, a.punto))
    const trozos = Math.max(1, Math.round(tramo / paso))
    for (let k = 1; k <= trozos; k++) {
      const f = k / trozos
      puntos.push(mezcla(a.punto, b.punto, f))
      normales.push(unitario(mezcla(a.normal, b.normal, f)))
      total += tramo / trozos
      acumulado.push(total)
    }
    posicionDeNodo.push(total)
  }
  // Prolongación por los dos extremos, a lo largo de la línea que ya hay.
  const primero = unitario(resta(puntos[0], puntos[1]))
  const ultimo = unitario(resta(puntos[puntos.length - 1], puntos[puntos.length - 2]))
  puntos.unshift(suma(puntos[0], escala(primero, prolongacion)))
  normales.unshift(normales[0])
  puntos.push(suma(puntos[puntos.length - 1], escala(ultimo, prolongacion)))
  normales.push(normales[normales.length - 1])
  const largoTotal = total + 2 * prolongacion
  return {
    puntos,
    normales,
    // Cada nodo cae a su distancia del principio de la línea prolongada.
    posiciones: posicionDeNodo.map((d) => (d + prolongacion) / largoTotal),
  }
}

/** Lo que se le dice a quien disecó, para escribirlo en el registro de la consola. */
export function textoDeLaDiseccion(capa: CapaDeLaHerida, aperturas: number): string {
  const plano = capa === 'piel' ? 'la piel' : 'el plano muscular'
  return aperturas <= 1
    ? `Disección roma en ${plano}: el tejido se separó por tensión, sin cortar. Avance un poco y vuelva a abrir las ramas.`
    : `Disección roma en ${plano}: ${aperturas} aperturas. Los planos se separan por tensión y no por corte, que es lo que protege lo que hay debajo.`
}
