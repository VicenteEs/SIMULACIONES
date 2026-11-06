/**
 * Pedir un instrumento por su nombre (P-012 E5).
 *
 * En pabellón el cirujano no busca en la mesa: pide «¡Farabeuf!» y se lo ponen en la mano. Aquí era abrir su familia en
 * la columna de la izquierda, o escribir en el buscador de la mesa, que solo se ve con esa columna a la vista y que con
 * más de una coincidencia no coge ninguna al pulsar Enter. Con la tecla I se abre, encima del lienzo, un buscador que lee
 * como el de la mesa —por palabras, sin tildes ni mayúsculas (`paraComparar`)— y que con Enter pone en la mano el
 * primero de la lista.
 *
 * El orden de la lista no sale del paso, en ningún modo. Si el que pide el paso subiera el primero, el buscador diría qué
 * instrumento toca, y en evaluación eso es justo lo que se mide (lo mismo que el menú radial, `menuRadial.ts`). Sale de
 * cuánto se parece el nombre a lo escrito y, a igualdad, del orden de la mesa y del alfabeto: lo mismo escrito da siempre
 * la misma lista. Tampoco ayuda más en práctica: un buscador que en práctica sugiriera y en evaluación no enseñaría a
 * fiarse de algo que el día de la evaluación desaparece.
 *
 * Puro, para probarlo sin consola.
 */

import { paraComparar } from './catalogosAmpliables'

export interface InstrumentoParaPedir {
  id: string
  nombre: string
  descripcion?: string | null
  /** El sitio de su familia en la mesa: el desempate, para que la lista salga en el orden en que se ve la mesa. */
  orden: number
}

/** Cuántos se enseñan como mucho: más no se leen de un vistazo, y con la mesa completa son más de ochenta. */
export const MAXIMO_A_LA_VISTA = 8

/** Las palabras de lo escrito, como las lee el buscador de la mesa. */
export const palabrasDe = (escrito: string): string[] => paraComparar(escrito).split(' ').filter(Boolean)

/**
 * Cuánto se parece el instrumento a lo escrito, de 0 (su nombre empieza así) a 3 (solo lo dice la descripción), o `null`
 * si no coincide.
 *
 * Coincide con la regla del buscador de la mesa —cada palabra, en el nombre o en la descripción—, para que los dos no
 * discrepen nunca sobre qué hay en la bandeja: lo que uno encuentra, el otro también. Lo que añade es el orden.
 */
export function parecidoAlNombre(i: InstrumentoParaPedir, palabras: readonly string[]): number | null {
  if (palabras.length === 0) return null
  const nombre = paraComparar(i.nombre)
  const todo = paraComparar(`${i.nombre} ${i.descripcion ?? ''}`)
  if (!palabras.every((p) => todo.includes(p))) return null
  if (nombre.startsWith(palabras.join(' '))) return 0
  // Cada palabra, al principio de una del nombre: «sep hohm» es el separador de Hohmann antes que la pinza que lo dice
  // en medio de una palabra.
  const conEspacio = ` ${nombre}`
  if (palabras.every((p) => conEspacio.includes(` ${p}`))) return 1
  if (palabras.every((p) => nombre.includes(p))) return 2
  return 3
}

/** Todos los que coinciden con lo escrito, el más parecido primero. Sin nada escrito, ninguno. */
export function instrumentosPedidos<T extends InstrumentoParaPedir>(instrumental: readonly T[], escrito: string): T[] {
  const palabras = palabrasDe(escrito)
  const vistos = new Set<string>()
  return instrumental
    .flatMap((i) => {
      if (vistos.has(i.id)) return []
      vistos.add(i.id)
      const parecido = parecidoAlNombre(i, palabras)
      return parecido === null ? [] : [{ i, parecido }]
    })
    .sort((a, b) => a.parecido - b.parecido || a.i.orden - b.i.orden || a.i.nombre.localeCompare(b.i.nombre, 'es'))
    .map(({ i }) => i)
}
