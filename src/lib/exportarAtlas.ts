import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { nombreDeNodo, type ObjetoParaGlb } from '@/lib/glb'

/**
 * De una preparación del atlas a un modelo que la consola pueda abrir.
 *
 * El atlas y el simulador son dos motores distintos. El atlas dibuja el cuerpo
 * fusionando todas las piezas de un sistema en una sola malla y decidiendo qué
 * se ve con una textura; la consola carga un archivo con objetos con nombre,
 * mueve uno de ellos y mide milímetros. Enseñarle el atlas a la consola sería
 * reescribir el simulador entero.
 *
 * Así que el puente va al revés: la preparación se **exporta** a un archivo del
 * mismo formato que sale de Blender, y la consola no se entera de que existe un
 * atlas. Para ella es un modelo más.
 *
 * Aquí vive la parte que se puede probar sin archivos ni base de datos: agrupar
 * y reindexar. Leer los paquetes y escribir el documento es trabajo del
 * servidor y vive en la acción.
 */

/** Cuántos bytes ocupa el modelo antes de que nadie lo quiera abrir. */
export const TECHO_BYTES = 5 * 1024 * 1024

/**
 * Una pieza ya leída del paquete, con su geometría suelta.
 *
 * Los índices llegan **locales a la pieza**, empezando en cero: así viajan en
 * el paquete del atlas, y así hay que reindexarlos al fusionar.
 */
export interface PiezaLeida {
  id: string
  nombre: string
  sistema: string
  posiciones: Float32Array
  normales: Int16Array
  indices: Uint32Array
}

export interface OpcionesDeExportacion {
  /**
   * Piezas que salen como objeto propio en vez de fundirse con su sistema.
   *
   * Son las protagonistas del caso: la tibia que se va a romper, el fragmento
   * que hay que reducir. El resto se funde por sistema a propósito: exportar
   * ciento treinta y nueve objetos sueltos obligaría al médico a escribir
   * ciento treinta y nueve filas de piezas en el caso para poder ver la pierna,
   * porque la consola apaga todo lo que el caso no declara.
   */
  protagonistas?: string[]
  /** Color por sistema, del catálogo. */
  colores?: Record<string, string>
}

/** «#aabbcc» a los cuatro decimales que quiere glTF. */
export function colorDeGltf(hex: string | undefined): [number, number, number, number] {
  const limpio = (hex ?? '').replace('#', '')
  if (limpio.length !== 6) return [0.8, 0.8, 0.8, 1]
  const n = Number.parseInt(limpio, 16)
  if (!Number.isFinite(n)) return [0.8, 0.8, 0.8, 1]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
}

/**
 * Agrupa las piezas leídas en los objetos que tendrá el archivo.
 *
 * Cada protagonista es su propio objeto. Las demás se funden por sistema, con
 * los índices corridos para que sigan apuntando a su vértice: al pegar la
 * segunda pieza detrás de la primera, sus índices tienen que sumar cuantos
 * vértices llevaba la anterior. Equivocarse aquí no da error, da una malla con
 * triángulos cosidos al azar.
 */
export function agruparParaGlb(
  piezas: PiezaLeida[],
  opciones: OpcionesDeExportacion = {},
): ObjetoParaGlb[] {
  const protagonistas = new Set(opciones.protagonistas ?? [])
  const colores = opciones.colores ?? {}

  const sueltas: PiezaLeida[] = []
  const porSistema = new Map<string, PiezaLeida[]>()

  for (const pieza of piezas) {
    if (protagonistas.has(pieza.id)) {
      sueltas.push(pieza)
      continue
    }
    const grupo = porSistema.get(pieza.sistema)
    if (grupo) grupo.push(pieza)
    else porSistema.set(pieza.sistema, [pieza])
  }

  const salida: ObjetoParaGlb[] = []

  // Las protagonistas primero y con su nombre anatómico: son las que el médico
  // va a escribir en el caso, y conviene que salgan arriba en la lista.
  for (const pieza of sueltas) {
    salida.push({
      nombre: pieza.nombre,
      posiciones: pieza.posiciones,
      normales: pieza.normales,
      indices: pieza.indices,
      color: colorDeGltf(colores[pieza.sistema]),
    })
  }

  for (const [sistema, grupo] of porSistema) {
    salida.push({
      nombre: sistema,
      ...fusionar(grupo),
      color: colorDeGltf(colores[sistema]),
    })
  }

  return salida
}

/** Pega varias piezas en una sola malla, corriendo los índices. */
function fusionar(grupo: PiezaLeida[]): {
  posiciones: Float32Array
  normales: Int16Array
  indices: Uint32Array
} {
  const vertices = grupo.reduce((t, p) => t + p.posiciones.length / 3, 0)
  const cuantos = grupo.reduce((t, p) => t + p.indices.length, 0)

  const posiciones = new Float32Array(vertices * 3)
  const normales = new Int16Array(vertices * 3)
  const indices = new Uint32Array(cuantos)

  let vBase = 0
  let iBase = 0
  for (const pieza of grupo) {
    posiciones.set(pieza.posiciones, vBase * 3)
    normales.set(pieza.normales, vBase * 3)
    for (let k = 0; k < pieza.indices.length; k += 1) indices[iBase + k] = pieza.indices[k] + vBase
    vBase += pieza.posiciones.length / 3
    iBase += pieza.indices.length
  }

  return { posiciones, normales, indices }
}

/**
 * Qué piezas del catálogo corresponden a una preparación, en su orden.
 *
 * Una preparación guarda identificadores, no geometría, y puede nombrar piezas
 * que ya no existan si el atlas se regeneró. Las que no se encuentran se
 * devuelven aparte en vez de desaparecer: exportar de menos sin decirlo es
 * entregar una pierna a la que le falta un hueso.
 */
export function piezasDeLaPreparacion(
  catalogo: CatalogoDelAtlas,
  ids: string[],
): { encontradas: PiezaDelAtlas[]; perdidas: string[] } {
  const porId = new Map(catalogo.piezas.map((p) => [p.id, p]))
  const encontradas: PiezaDelAtlas[] = []
  const perdidas: string[] = []
  for (const id of ids) {
    const pieza = porId.get(id)
    if (pieza) encontradas.push(pieza)
    else perdidas.push(id)
  }
  return { encontradas, perdidas }
}

/**
 * Los nombres de objeto que tendrá el archivo, para enseñárselos al médico.
 *
 * Son los saneados, no los anatómicos: es lo que la consola verá y lo que hay
 * que escribir en las piezas del caso.
 */
export function nombresDelArchivo(objetos: ObjetoParaGlb[]): string[] {
  return objetos.map((o) => nombreDeNodo(o.nombre))
}
