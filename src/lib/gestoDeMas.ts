import type { Punto } from './incisiones'
import type { Objetivo } from './simulador'

/**
 * El gesto de más en evaluación (D-330): una segunda incisión aparte en el paso que mide la incisión, o una segunda
 * trayectoria en el que mide una perforación.
 *
 * Hasta D-314 la lista y la nota medían el último gesto: la incisión mal puesta se dejaba y se trazaba otra al lado, o se
 * perforaba otro agujero, y el primero quedaba en el paciente sin costar nada. El dueño decidió que el paso valga cero,
 * como una complicación, y que quede en el registro. En pabellón eso son dos heridas que cerrar, o un agujero de más en
 * el hueso que lo debilita y que puede llevarse la broca o el tornillo que vengan después.
 *
 * Aquí está lo que se prueba sin `three`: qué cuenta como «otro» gesto. El lienzo dice lo que pasó y la consola lleva la
 * cuenta del paso con esto.
 */

export type GestoDeMas = 'incision' | 'trayectoria'

/** El gesto que cada objetivo mide, y por eso el único que en él no se puede repetir aparte. */
export function gestoQueMide(objetivo: Objetivo): GestoDeMas | null {
  if (objetivo === 'trazo') return 'incision'
  if (objetivo === 'perforacion') return 'trayectoria'
  return null
}

/** Dónde entró una broca y hacia dónde iba, en milímetros de la escena y con la dirección unitaria. */
export interface TrayectoriaDeLaBroca {
  entradaMm: Punto
  direccion: Punto
}

/**
 * Hasta dónde dos entradas son el mismo agujero. Es repasar lo hecho: la broca de núcleo de un tornillo de tracción entra
 * por el agujero de deslizamiento, y una broca que se vuelve a meter a mano apunta al agujero que ve, con el pulso de
 * quien la lleva. 3 mm cubren la broca más gruesa de la tabla (4,5 mm, 2,25 de radio) con margen, y un agujero aparte
 * que se perfora al lado de verdad queda casi siempre más lejos, porque dos agujeros a menos de su diámetro se tocan.
 */
export const MISMA_ENTRADA_MM = 3
/** Hasta cuántos grados se aparta la dirección sin ser otra trayectoria: lo que se tuerce la mano al volver a entrar. */
export const MISMA_DIRECCION_GRADOS = 15

const distancia = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * Si dos perforaciones van por la misma trayectoria. Se mira la dirección sin su sentido: entrar por el otro lado del
 * mismo agujero sigue siendo el mismo agujero.
 */
export function mismaTrayectoria(a: TrayectoriaDeLaBroca, b: TrayectoriaDeLaBroca): boolean {
  if (distancia(a.entradaMm, b.entradaMm) > MISMA_ENTRADA_MM) return false
  const coseno = Math.abs(a.direccion[0] * b.direccion[0] + a.direccion[1] * b.direccion[1] + a.direccion[2] * b.direccion[2])
  return coseno >= Math.cos((MISMA_DIRECCION_GRADOS * Math.PI) / 180)
}

/** Lo hecho en el paso que se está jugando, para saber si lo que llega es otro gesto. */
export interface GestosDelPasoEnCurso {
  paso: string
  /** Las incisiones nuevas de cada capa, por su identificador: alargar una no la cambia. */
  incisiones: Partial<Record<'piel' | 'fascia' | 'musculo', number[]>>
  trayectorias: TrayectoriaDeLaBroca[]
}

export const pasoEnCurso = (paso: string): GestosDelPasoEnCurso => ({ paso, incisiones: {}, trayectorias: [] })

/**
 * Una incisión nueva en el paso. Devuelve lo hecho con ella y si es la segunda aparte en su capa. Se cuenta por capa
 * porque la fascia que se abre debajo de la piel es la misma herida que se profundiza, no otra al lado.
 */
export function conIncision(
  hecho: GestosDelPasoEnCurso,
  incision: { id: number; capa: 'piel' | 'fascia' | 'musculo' },
): { hecho: GestosDelPasoEnCurso; deMas: boolean } {
  const previas = hecho.incisiones[incision.capa] ?? []
  if (previas.includes(incision.id)) return { hecho, deMas: false }
  return {
    hecho: { ...hecho, incisiones: { ...hecho.incisiones, [incision.capa]: [...previas, incision.id] } },
    deMas: previas.length >= 1,
  }
}

/** Una perforación en el paso, y si va por otra trayectoria que las de antes. */
export function conTrayectoria(
  hecho: GestosDelPasoEnCurso,
  trayectoria: TrayectoriaDeLaBroca,
): { hecho: GestosDelPasoEnCurso; deMas: boolean } {
  if (hecho.trayectorias.some((t) => mismaTrayectoria(t, trayectoria))) return { hecho, deMas: false }
  return { hecho: { ...hecho, trayectorias: [...hecho.trayectorias, trayectoria] }, deMas: hecho.trayectorias.length >= 1 }
}
