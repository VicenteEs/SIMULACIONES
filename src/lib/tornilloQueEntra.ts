/**
 * El tornillo que entra de a poco (P-004, pedido 13 de Cristóbal).
 *
 * «Recuerda permitir que el instrumental que está haciendo el hoyo, o esté midiendo, o el tornillo esté entrando, se quede en la
 * posición en que vas mientras pides el rayo.» La broca y el medidor ya se quedaban (E8); el tornillo, no: un clic en el agujero
 * lo dejaba asentado de golpe, y no había cómo pedir una imagen con el tornillo a medio camino para ver si la punta va a buscar
 * la cortical opuesta. Ahora el clic lo deja en la entrada del agujero y entra con la rueda, como la broca; se queda donde va
 * mientras se dispara, y solo al asentar la cabeza cuenta, se juzga y comprime.
 *
 * Aquí está la cuenta, en milímetros y sin escena: cuánto entra por muesca, cuánto gira y qué se le dice a quien atornilla. El
 * lienzo guarda el estado y llama a estas funciones.
 *
 * Es puro y sin three: se prueba con números.
 */

/**
 * Lo que entra con una muesca de la rueda; con Mayúsculas, la cuarta parte. Es más que la broca (0,5 mm): el tornillo mide
 * entre 10 y 80 mm y se mete entero, y de a medio milímetro uno de 40 pediría ochenta muescas. Con 2 mm son veinte, que es
 * del orden de las vueltas que da la mano con el destornillador.
 */
export const PASO_DEL_TORNILLO_MM = 2
export const PASO_FINO_DEL_TORNILLO_MM = 0.5

/** Por debajo de esto la cabeza ya está apoyada en la placa: la rueda redondea y no se puede quedar a una centésima. */
export const TOLERANCIA_DE_ASIENTO_MM = 0.05

/**
 * Lo metido tras una muesca: `sentido` 1 mete y −1 saca. No pasa de la entrada (0) ni del largo del tornillo, que es cuando
 * la cabeza toca la placa.
 */
export function metidoTrasLaRueda(metidoMm: number, largoMm: number, sentido: 1 | -1, fino = false): number {
  const paso = fino ? PASO_FINO_DEL_TORNILLO_MM : PASO_DEL_TORNILLO_MM
  return Math.min(Math.max(0, largoMm), Math.max(0, Math.round((metidoMm + sentido * paso) * 100) / 100))
}

/** Si la cabeza ya está apoyada: lo que distingue al tornillo que todavía entra del que se da por puesto. */
export function estaAsentado(metidoMm: number, largoMm: number): boolean {
  return largoMm - metidoMm <= TOLERANCIA_DE_ASIENTO_MM
}

/**
 * El paso de la rosca según el diámetro, en milímetros por vuelta: es lo que avanza el tornillo en una vuelta entera, y lo que
 * hace girar el modelo al meterlo. Los de la caja AO: el cortical de 2,7 avanza 1 mm; el de 3,5, 1,25; el de 4,5, 1,75; los
 * de esponjosa (6,5 y más), 2,75. Un diámetro que no está en la lista toma el del escalón de arriba.
 */
export function pasoDeLaRoscaMm(diametroMm: number): number {
  if (diametroMm <= 2.7) return 1
  if (diametroMm <= 3.5) return 1.25
  if (diametroMm <= 4.5) return 1.75
  return 2.75
}

/** Cuánto ha girado, en radianes, un tornillo metido `metidoMm`: una vuelta entera por cada paso de rosca. */
export function giroDelTornilloRad(metidoMm: number, diametroMm: number): number {
  return (metidoMm / pasoDeLaRoscaMm(diametroMm)) * Math.PI * 2
}

const coma = (n: number) => n.toFixed(1).replace('.', ',')

/**
 * Lo que se le dice a quien atornilla. `agujero` va contado desde 1, como lo ve el residente. Se dice siempre cuánto falta para
 * asentar: no es una pista que regale el examen —la cabeza se ve fuera de la placa—, y es lo que se mira al pedir el rayo.
 */
export function textoDelTornilloQueEntra(t: { largoMm: number; metidoMm: number; agujero: number }): string {
  const falta = Math.max(0, t.largoMm - t.metidoMm)
  if (falta <= TOLERANCIA_DE_ASIENTO_MM) return `Tornillo de ${t.largoMm} mm en el agujero ${t.agujero}: asentado`
  if (t.metidoMm <= 0) return `Tornillo de ${t.largoMm} mm en la entrada del agujero ${t.agujero}: todavía no entra`
  return `Tornillo de ${t.largoMm} mm en el agujero ${t.agujero}: lleva ${coma(t.metidoMm)} mm · faltan ${coma(falta)} mm para asentar la cabeza`
}
