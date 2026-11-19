import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

/**
 * Los archivos del pabellón del simulador —la sala, la camilla, el paño, la
 * mesa y la arsenalera— y cómo se sirven solo con sesión (D-419).
 *
 * Vivían en `public/pabellon/`, y todo lo de `public/` lo entrega Next a
 * cualquiera, sin preguntar: `https://traumahub.cl/pabellon/colchon.glb` se
 * bajaba sin cuenta. Ahora viven en `privado/pabellon/`, que Next no sirve, y
 * salen por `src/app/(frontend)/pabellon/[archivo]/route.ts`, que mira la sesión
 * antes de abrir nada. La dirección es la misma, así que el simulador no cambió
 * una línea.
 *
 * No hay que devolverlos a `public/`. Next sirve un archivo de `public/` antes de
 * mirar las rutas, de modo que uno que vuelva ahí —un guion de Blender con el
 * destino viejo, una copia hecha a mano— tapa la ruta sin ningún aviso y vuelve
 * a estar abierto. `tests/unit/archivosDelPabellon.test.ts` falla si aparece.
 */

/** Relativa al directorio de trabajo, como el `staticDir` de Payload: en el contenedor es `/app/privado/pabellon`. */
export const CARPETA_DEL_PABELLON = resolve('privado', 'pabellon')

/**
 * Lo que el simulador pide, por extensión. Lo que no está aquí no se sirve
 * aunque esté en la carpeta: un `.blend` o una vista de prueba dejados ahí por
 * descuido no salen.
 */
const TIPOS: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
}

/**
 * Los nombres que salen de `scripts/pabellon/`: minúsculas, números y guiones,
 * y una extensión de la lista. Sin barras ni puntos de más, así que con el
 * nombre no se sale de la carpeta; aun así se comprueba el camino resuelto, por
 * si un día alguien afloja el filtro.
 */
const NOMBRE = /^[a-z0-9][a-z0-9-]*\.[a-z]+$/

export function tipoDelArchivoDelPabellon(nombre: string): string | null {
  if (!NOMBRE.test(nombre)) return null
  return TIPOS[extname(nombre)] ?? null
}

export interface ArchivoDelPabellon {
  camino: string
  tipo: string
  bytes: number
  /** El `ETag`: la huella del contenido, entre comillas. */
  huella: string
}

/**
 * La huella de cada archivo, calculada una vez por proceso. Va por contenido y no
 * por fecha: `git` y `docker build` cambian la fecha de un archivo que no cambió,
 * y un `ETag` de fecha haría bajar otra vez los 4 MB del paño tras cada
 * despliegue. Se recalcula si cambian el tamaño o la fecha, que en desarrollo es
 * cuando un guion de Blender lo vuelve a escribir.
 */
const huellas = new Map<string, { bytes: number; fecha: number; huella: string }>()

/** El archivo pedido, o `null` si no es uno de los que se sirven o no existe. */
export async function archivoDelPabellon(
  nombre: string,
  carpeta: string = CARPETA_DEL_PABELLON,
): Promise<ArchivoDelPabellon | null> {
  const tipo = tipoDelArchivoDelPabellon(nombre)
  if (!tipo) return null
  const camino = resolve(carpeta, nombre)
  if (!camino.startsWith(carpeta + sep)) return null
  const datos = await stat(camino).catch(() => null)
  if (!datos?.isFile()) return null

  const guardada = huellas.get(camino)
  if (guardada && guardada.bytes === datos.size && guardada.fecha === datos.mtimeMs) {
    return { camino, tipo, bytes: datos.size, huella: guardada.huella }
  }
  const huella = `"${createHash('sha256').update(await readFile(camino)).digest('base64url').slice(0, 27)}"`
  huellas.set(camino, { bytes: datos.size, fecha: datos.mtimeMs, huella })
  return { camino, tipo, bytes: datos.size, huella }
}

/**
 * ¿La copia que el navegador ya tiene es esta? Lee `If-None-Match` como lo
 * manda de verdad: puede traer varias huellas separadas por comas, o `*`, y
 * Cloudflare marca la huella como débil (`W/"…"`) cuando comprime la respuesta
 * por el camino. Para decir «no ha cambiado» basta la comparación débil.
 */
export function yaLaTiene(cabecera: string | null, huella: string): boolean {
  if (!cabecera) return false
  return cabecera
    .split(',')
    .map((parte) => parte.trim().replace(/^W\//, ''))
    .some((parte) => parte === '*' || parte === huella)
}
