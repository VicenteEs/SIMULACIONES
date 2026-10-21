/**
 * Los agujeros de una placa cuando el modelo no trae su posición (P-004 E6, pedido 5 de Cristóbal y respuesta Q2 del dueño).
 *
 * El simulador necesita saber dónde cae cada agujero para centrar la broca y poner el tornillo. glTF no lo dice por sí
 * solo —un agujero es la ausencia de malla—, así que los scripts de Blender lo escriben en el archivo (`th.agujeros`).
 * Una placa cargada **sin** ese dato respondía «este modelo no trae la posición de sus agujeros» y no dejaba poner ni un
 * tornillo. El editor, al crear el instrumento, escribe cuántos orificios tiene (`orificios`); con eso se **reparten a
 * partes iguales a lo largo de la caja del modelo**. Si el modelo sí trae sus agujeros, esos mandan y el número solo se
 * contrasta: un aviso si no coinciden.
 *
 * Es puro y sin three: lo llama `colocarPlaca` con la caja del modelo y se prueba con números.
 */

/** Un agujero en el marco de Blender en que se modeló la placa: (ancho, largo), en milímetros. */
export type AgujeroMm = [number, number]

/** La caja de la placa en ese marco: el centro a lo ancho y los extremos a lo largo. */
export interface CajaDeLaPlacaMm {
  centroXMm: number
  yMinimoMm: number
  yMaximoMm: number
}

/** Cuántos orificios se aceptan: una placa real va de 2 a 20, y 40 deja holgura sin permitir un absurdo. */
export const MINIMO_DE_ORIFICIOS = 1
export const MAXIMO_DE_ORIFICIOS = 40

/** El número de orificios tal como se guarda: un entero dentro del rango, o `null` si no dice nada útil. */
export function orificiosValidos(valor: unknown): number | null {
  const n = typeof valor === 'string' ? Number(valor.trim().replace(',', '.')) : valor
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  const entero = Math.round(n)
  return entero >= MINIMO_DE_ORIFICIOS && entero <= MAXIMO_DE_ORIFICIOS ? entero : null
}

/**
 * `cantidad` agujeros a partes iguales: la caja se divide en `cantidad` tramos y cada agujero cae en el centro de su
 * tramo, así que queda medio tramo libre en cada extremo (el borde de la placa no se perfora) y la distancia entre
 * agujeros es la misma. Con uno solo, en el centro.
 */
export function agujerosUniformes(cantidad: number, caja: CajaDeLaPlacaMm): AgujeroMm[] {
  const n = orificiosValidos(cantidad)
  if (n === null) return []
  const largo = caja.yMaximoMm - caja.yMinimoMm
  if (!(largo > 0)) return []
  const paso = largo / n
  return Array.from({ length: n }, (_, i): AgujeroMm => [caja.centroXMm, caja.yMinimoMm + (i + 0.5) * paso])
}

/**
 * Qué decir cuando el modelo trae sus agujeros y el instrumento también declara una cantidad. `null` si coinciden o si el
 * instrumento no declaró nada: lo que manda siempre es el modelo, y el aviso solo le enseña al editor que hay dos datos
 * que no se dicen lo mismo.
 */
export function avisoDeOrificios(delModelo: number, escritos: number | null): string | null {
  if (escritos === null || delModelo === escritos) return null
  return `El modelo trae ${delModelo} agujeros y el instrumento dice ${escritos}: se usan los del modelo.`
}
