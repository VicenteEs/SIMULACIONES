import type { ComplicacionDelCaso } from './progresoDelSimulador'
import type { RegistroDeInsumos } from './insumos'

/**
 * Dónde se quedó el residente en un caso del simulador (P-009, mejora de uso 12), y lo hecho sobre el paciente al
 * empezar cada paso.
 *
 * Hasta aquí lo cortado y lo colocado sobrevivía a recargar la página dentro de la misma pestaña (`sessionStorage`,
 * D-171), pero el paso y el puntaje no: se recargaba en el paso 5 con la placa puesta y la consola volvía al paso 1 con
 * la placa todavía en el hueso. Y cerrar la pestaña lo perdía todo, que en un caso de media hora entre dos turnos es lo
 * corriente. Ahora la consola guarda en la cuenta, al empezar cada paso, el paso, el modo, la cuenta del puntaje y lo
 * hecho sobre el paciente en ese momento, y el caso se sigue otro día y en otro equipo («Seguir donde lo dejó»).
 *
 * Se guarda **al empezar el paso** y no a cada gesto: es una escritura por paso, como el recorrido, y lo que se
 * recupera es un estado entero del que se sabe que es coherente. Lo hecho a mitad de un paso se pierde si se cambia de
 * equipo —en la misma pestaña no, que para eso sigue la sesión—, y el paso se repite desde su principio, que es lo que
 * haría «Repetir este paso».
 *
 * Puro: lo usan la consola, la acción que lo guarda y la página que lo devuelve.
 */

/** Lo que hay sobre el paciente, como lo guarda el lienzo en la pestaña: lo cortado y cosido, y lo colocado. */
export interface InstantaneaDelLienzo {
  sesion: string
  colocado: string
}

export const INSTANTANEA_VACIA: InstantaneaDelLienzo = { sesion: '', colocado: '' }

export const mismaInstantanea = (a: InstantaneaDelLienzo, b: InstantaneaDelLienzo) =>
  a.sesion === b.sesion && a.colocado === b.colocado

export type ModoDeJuego = 'practica' | 'evaluacion'

export interface AvanceDelCaso {
  v: 1
  /** El paso en que se quedó, desde 0. */
  paso: number
  modo: ModoDeJuego
  puntaje: number
  /** Los pasos superados, fallados, con complicación y con reducción automática: lo que decide lo que vale cada uno. */
  resueltos: string[]
  fallados: string[]
  complicados: string[]
  automaticas: string[]
  complicaciones: ComplicacionDelCaso[]
  insumos: RegistroDeInsumos
  /** Lo que había sobre el paciente al empezar ese paso. */
  instantanea: InstantaneaDelLienzo
  /** Cuándo se guardó, en ISO: distingue este avance del que la pestaña ya tiene restaurado. */
  guardadoEn: string
}

/**
 * Lo más que puede ocupar, en caracteres. Lo cortado son polilíneas de puntos y una pierna con tres abordajes cabe en
 * unas decenas de kB; el tope está para que una fila de `actividad` no crezca sin freno, que la portada las lee todas.
 */
export const TOPE_DEL_AVANCE = 400_000

const listaDeTextos = (valor: unknown, que: string): string[] => {
  if (!Array.isArray(valor) || valor.some((x) => typeof x !== 'string' || x.length > 200) || valor.length > 500) {
    throw new Error(`${que} del avance no llegaron como una lista de identificadores.`)
  }
  return valor as string[]
}

/**
 * El avance que llega del navegador, comprobado entero, o un error que dice qué falla. `null` es «no hay avance»: lo
 * manda la consola al terminar el caso.
 */
export function avanceValido(valor: unknown): AvanceDelCaso | null {
  if (valor === null) return null
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('El avance no llegó como corresponde.')
  const a = valor as Record<string, unknown>
  if (a.v !== 1) throw new Error('El avance es de una versión que esta plataforma no conoce.')
  if (typeof a.paso !== 'number' || !Number.isInteger(a.paso) || a.paso < 0 || a.paso > 500) {
    throw new Error('El paso del avance no es válido.')
  }
  if (a.modo !== 'practica' && a.modo !== 'evaluacion') throw new Error('El modo del avance no es válido.')
  if (typeof a.puntaje !== 'number' || !Number.isFinite(a.puntaje) || a.puntaje < 0 || a.puntaje > 100_000) {
    throw new Error('El puntaje del avance no es válido.')
  }
  const i = a.instantanea as Record<string, unknown> | null | undefined
  if (!i || typeof i !== 'object' || typeof i.sesion !== 'string' || typeof i.colocado !== 'string') {
    throw new Error('Lo hecho sobre el paciente no llegó como corresponde.')
  }
  if (!Array.isArray(a.complicaciones) || a.complicaciones.length > 100) {
    throw new Error('Las complicaciones del avance tienen que llegar en una lista.')
  }
  if (!a.insumos || typeof a.insumos !== 'object' || Array.isArray(a.insumos)) {
    throw new Error('Los insumos del avance no llegaron como corresponde.')
  }
  if (typeof a.guardadoEn !== 'string' || Number.isNaN(Date.parse(a.guardadoEn))) {
    throw new Error('La fecha del avance no es válida.')
  }
  const avance: AvanceDelCaso = {
    v: 1,
    paso: a.paso,
    modo: a.modo,
    puntaje: a.puntaje,
    resueltos: listaDeTextos(a.resueltos, 'Los pasos superados'),
    fallados: listaDeTextos(a.fallados, 'Los pasos fallados'),
    complicados: listaDeTextos(a.complicados, 'Los pasos con complicación'),
    automaticas: listaDeTextos(a.automaticas, 'Los pasos con reducción automática'),
    complicaciones: a.complicaciones as ComplicacionDelCaso[],
    insumos: a.insumos as RegistroDeInsumos,
    instantanea: { sesion: i.sesion, colocado: i.colocado },
    guardadoEn: a.guardadoEn,
  }
  if (JSON.stringify(avance).length > TOPE_DEL_AVANCE) {
    throw new Error('Lo hecho sobre el paciente ocupa demasiado para guardarlo en la cuenta.')
  }
  return avance
}

/** El avance de una fila de `actividad`, o `null` si no hay o no se reconoce: la página no se cae por una fila rara. */
export function avanceDeLaFila(fila: unknown, pasos: number): AvanceDelCaso | null {
  const crudo = fila && typeof fila === 'object' ? (fila as Record<string, unknown>).avance : null
  if (crudo === null || crudo === undefined) return null
  try {
    const avance = avanceValido(crudo)
    // Un caso al que le quitaron pasos después: ese paso ya no existe y el avance no sirve.
    return avance && avance.paso < pasos ? avance : null
  } catch {
    return null
  }
}

/**
 * Apila lo que hay ahora en el paciente para «Deshacer» (P-009, mejora de uso 10), sin repetir el último y sin pasar
 * del tope. Al pasarse se cae el más viejo menos el primero, que es el principio del paso: deshacer nunca lleva más
 * atrás de donde empezó el paso, pero siempre puede llegar hasta ahí.
 */
export function apilar<T extends InstantaneaDelLienzo>(pila: readonly T[], nueva: T, tope = 30): T[] {
  const ultima = pila[pila.length - 1]
  if (ultima && mismaInstantanea(ultima, nueva)) return pila as T[]
  const siguiente = [...pila, nueva]
  return siguiente.length > tope ? [siguiente[0], ...siguiente.slice(siguiente.length - tope + 1)] : siguiente
}
