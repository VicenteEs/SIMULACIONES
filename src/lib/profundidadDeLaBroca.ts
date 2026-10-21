/**
 * Cuánto avanza la broca y cuánto le falta (P-004 E8, pedidos 3 y 13 de Cristóbal).
 *
 * «El rayo muchas veces se usa para saber qué tan profundo vas.» Perforar era **mantener pulsado**: al soltar el ratón se
 * terminaba el hoyo, y al ir al botón «Disparar» el cursor salía del lienzo y la broca se escondía, de modo que no se podía pedir
 * una imagen con la broca a la mitad de la cortical, que es justo para lo que sirve. Ahora la broca **se queda puesta** en el hoyo
 * hasta que se la retira; avanza manteniendo pulsado, con la rueda o hacia atrás con la rueda, y se apaga sin retirarla.
 *
 * Aquí está la cuenta, en milímetros y sin escena: cuánto avanza por cuadro o por muesca, hasta dónde puede ir y qué se le dice
 * a quien perfora. El lienzo guarda el estado y llama a estas funciones.
 *
 * Es puro y sin three: se prueba con números.
 */

/** Lo que mueve una muesca de la rueda, en milímetros; con Mayúsculas, la quinta parte. */
export const PASO_DE_LA_RUEDA_MM = 0.5
export const PASO_FINO_DE_LA_RUEDA_MM = 0.1

/** Lo que se deja pasar de largo la cortical opuesta: es un error que se comete y conviene que se vea y se diga. */
export const MARGEN_PARA_PASARSE_MM = 12

/**
 * La profundidad tras un cuadro con la broca encendida y el ratón pulsado: avanza `avanceMmPorSegundo` y no pasa de `maximaMm`.
 * `dtSegundos` se acota a 50 ms, como el bucle de dibujo, para que un cuadro largo (una pestaña en segundo plano) no clave la
 * broca de golpe en el otro lado del hueso.
 */
export function profundidadTrasUnCuadro(profundidadMm: number, maximaMm: number, avanceMmPorSegundo: number, dtSegundos: number): number {
  const dt = Math.min(0.05, Math.max(0, dtSegundos))
  return Math.min(maximaMm, Math.max(0, profundidadMm + avanceMmPorSegundo * dt))
}

/**
 * La profundidad tras una muesca de la rueda: `sentido` 1 mete la broca y −1 la saca. Hacia atrás no pasa de la entrada (0) y
 * hacia delante no pasa de `maximaMm`. La rueda mueve también con la broca apagada: apagarla es dejar de girar, no de poder
 * ajustar hasta dónde llega.
 */
export function profundidadTrasLaRueda(profundidadMm: number, maximaMm: number, sentido: 1 | -1, fino = false): number {
  const paso = fino ? PASO_FINO_DE_LA_RUEDA_MM : PASO_DE_LA_RUEDA_MM
  return Math.min(maximaMm, Math.max(0, Math.round((profundidadMm + sentido * paso) * 100) / 100))
}

export interface LecturaDeLaBroca {
  profundidadMm: number
  /** Cuánto falta para llegar a la cortical opuesta; 0 si ya llegó o se pasó. */
  faltaMm: number
  /** Cuánto se pasó de la cortical opuesta; 0 si no. */
  pasadoMm: number
  /** Dónde está la punta: antes de la cortical opuesta, ya en ella (dentro de medio milímetro) o más allá. */
  posicion: 'entrando' | 'en-la-cortical-opuesta' | 'pasada'
}

/** Medio milímetro de tolerancia para dar la cortical opuesta por alcanzada (el mismo que usa la anotación de «bicortical»). */
export const TOLERANCIA_DE_LA_CORTICAL_MM = 0.5

export function lecturaDeLaBroca(profundidadMm: number, salidaPorLaOpuestaMm: number): LecturaDeLaBroca {
  const falta = Math.max(0, salidaPorLaOpuestaMm - profundidadMm)
  const pasado = Math.max(0, profundidadMm - salidaPorLaOpuestaMm)
  return {
    profundidadMm,
    faltaMm: falta,
    pasadoMm: pasado,
    posicion: pasado > 1 ? 'pasada' : falta <= TOLERANCIA_DE_LA_CORTICAL_MM ? 'en-la-cortical-opuesta' : 'entrando',
  }
}

const coma = (n: number) => n.toFixed(1).replace('.', ',')

/**
 * Lo que se le dice a quien perfora. Con `ayudaDeAprendizaje` apagada no se cuenta cuánto falta: el examen no regala la
 * profundidad (se la pide a la imagen); sí se avisa de haberse pasado, que es un error y no una pista.
 */
export function textoDeLaBroca(lectura: LecturaDeLaBroca, opciones: { encendida: boolean; ayudaDeAprendizaje: boolean }): string {
  const partes = [`${coma(lectura.profundidadMm)} mm`]
  if (opciones.ayudaDeAprendizaje) {
    if (lectura.posicion === 'entrando') partes.push(`faltan ${coma(lectura.faltaMm)} mm para la cortical opuesta`)
    else if (lectura.posicion === 'en-la-cortical-opuesta') partes.push('en la cortical opuesta')
  }
  if (lectura.posicion === 'pasada') partes.push(`¡se pasó ${coma(lectura.pasadoMm)} mm de la cortical opuesta!`)
  if (!opciones.encendida) partes.push('apagada')
  return partes.join(' · ')
}
