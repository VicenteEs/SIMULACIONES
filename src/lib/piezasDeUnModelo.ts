import { open } from 'node:fs/promises'

/**
 * Qué piezas del atlas lleva dentro un modelo `.glb` (D-131).
 *
 * Casi todos los modelos del catálogo salieron del propio atlas: los exporta el
 * taller, y cada malla viaja con `extras.part_id`, el identificador de la pieza
 * de la que salió. Eso es lo que permite abrirlos en el taller sin cargar su
 * geometría: se encienden esas piezas del atlas y quedan al alcance de todas
 * sus herramientas.
 *
 * Solo se lee la cabecera y el bloque JSON del archivo, nunca la geometría: un
 * `.glb` de tres megabytes tiene un JSON de unos kilobytes al principio, y el
 * taller pregunta por los veintitantos modelos a la vez.
 */

/** Techo del bloque JSON. Los de verdad rondan los 100 KB; más que esto no es un modelo de los nuestros. */
const MAXIMO_DE_JSON = 8 * 1024 * 1024

const MAGIA_GLTF = 0x46546c67
const BLOQUE_JSON = 0x4e4f534a

/**
 * Los `part_id` de las mallas de un `.glb`, sin repetir y en su orden.
 *
 * Recibe los primeros bytes del archivo: la cabecera (12), la del primer bloque
 * (8) y el JSON. Devuelve una lista vacía ante cualquier cosa que no sea un
 * `.glb` bien formado: quien llama está pintando una lista, y un archivo raro
 * es un modelo que no se puede abrir, no un motivo para no pintar los demás.
 */
export function piezasDelGlb(bytes: Uint8Array): string[] {
  if (bytes.byteLength < 20) return []
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (vista.getUint32(0, true) !== MAGIA_GLTF) return []
  const largo = vista.getUint32(12, true)
  if (vista.getUint32(16, true) !== BLOQUE_JSON || 20 + largo > bytes.byteLength) return []

  let documento: { nodes?: { mesh?: number; extras?: { part_id?: unknown } }[] }
  try {
    documento = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + largo)))
  } catch {
    return []
  }
  const vistas = new Set<string>()
  for (const nodo of documento.nodes ?? []) {
    const id = nodo?.extras?.part_id
    if (typeof id === 'string' && id) vistas.add(id)
  }
  return [...vistas]
}

/** Lee de un archivo solo lo que `piezasDelGlb` necesita. */
export async function piezasDelArchivo(ruta: string): Promise<string[]> {
  let archivo
  try {
    archivo = await open(ruta, 'r')
  } catch {
    // El documento existe y su archivo no: pasa tras restaurar la base sin los
    // medios. Es un modelo que no se puede abrir, como cualquier otro raro.
    return []
  }
  try {
    const cabecera = new Uint8Array(20)
    const { bytesRead } = await archivo.read(cabecera, 0, 20, 0)
    if (bytesRead < 20) return []
    const largo = new DataView(cabecera.buffer).getUint32(12, true)
    if (largo > MAXIMO_DE_JSON) return []
    const todo = new Uint8Array(20 + largo)
    todo.set(cabecera)
    await archivo.read(todo, 20, largo, 20)
    return piezasDelGlb(todo)
  } finally {
    await archivo.close()
  }
}
