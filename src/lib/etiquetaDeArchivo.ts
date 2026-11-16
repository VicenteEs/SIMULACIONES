import { createHash } from 'node:crypto'

/**
 * La etiqueta (`ETag`) de un archivo subido, y el «no ha cambiado» que permite
 * (D-394, paso 4 de D-376).
 *
 * Payload sirve los archivos sin `ETag` (`uploads/endpoints/getFile.js`). Con la
 * caché de una hora de `cacheDeArchivoPrivado`, pasada esa hora el navegador
 * tiene que volver a preguntar, y sin etiqueta no tiene cómo decir «este ya lo
 * tengo»: baja el archivo entero otra vez. Una ficha con seis radiografías, o el
 * modelo 3D de un caso, que pesa varios megas, se bajaban de nuevo cada hora de
 * estudio.
 *
 * ## Por qué basta el nombre y el tamaño
 *
 * Un archivo subido no cambia: para cambiarlo se sube otro, y Payload le da otro
 * nombre si el anterior ya existe. La colección, el nombre y el tamaño lo
 * identifican sin leerlo. Leerlo para sacarle una huella del contenido costaría,
 * en cada petición, justo lo que la etiqueta quiere ahorrar. El tamaño va por si
 * algún día un archivo se reemplaza a mano en el disco con el mismo nombre: con
 * otro tamaño, al menos, la etiqueta cambia.
 *
 * ## El 304 también pasa por la sesión
 *
 * La comparación se hace **después** de que Payload atienda la petición, con su
 * comprobación de acceso (`checkFileAccess`). Quien no puede ver el archivo
 * recibe el 403 de siempre aunque mande la etiqueta correcta: un 304 le diría
 * que el archivo existe y que es el que él cree. Lo que se ahorra es el cuerpo,
 * que es lo que pesa; abrir el archivo y cerrarlo sin leerlo no cuesta casi nada.
 */

/** La etiqueta, fuerte y entre comillas, como la pide la cabecera. */
export function etiquetaDeArchivo(coleccion: string, nombre: string, tamano: string): string {
  const huella = createHash('sha256').update(`${coleccion}\n${nombre}\n${tamano}`).digest('base64url').slice(0, 27)
  return `"${huella}"`
}

/**
 * ¿La etiqueta está entre las que el navegador dice tener?
 *
 * `If-None-Match` puede traer varias separadas por comas, o `*`. La comparación
 * es la débil, que es la que manda la norma para esta cabecera: se ignora el
 * `W/` de delante. Cloudflare lo pone cuando comprime una respuesta, y sin
 * ignorarlo ningún navegador que llegue por el túnel acertaría nunca.
 */
export function coincideLaEtiqueta(siNoCoincide: string | null, etiqueta: string): boolean {
  if (!siNoCoincide) return false
  if (siNoCoincide.trim() === '*') return true
  return siNoCoincide
    .split(',')
    .map((parte) => parte.trim().replace(/^W\//, ''))
    .includes(etiqueta)
}

/**
 * El tamaño entero del archivo que sale en la respuesta. En una parcial (206)
 * es el número después de la barra de `Content-Range`, no el trozo.
 */
function tamanoEntero(respuesta: Response): string | null {
  if (respuesta.status === 206) {
    const total = respuesta.headers.get('Content-Range')?.split('/')[1]?.trim()
    return total && total !== '*' ? total : null
  }
  return respuesta.headers.get('Content-Length')
}

/**
 * La respuesta de Payload con su etiqueta, o un 304 si el navegador ya la tiene.
 *
 * Solo se toca una respuesta buena (200 o 206). Un error sale como vino, sin
 * etiqueta. Un trozo (206) lleva la etiqueta, para que el navegador sepa que los
 * trozos son del mismo archivo, pero nunca es un 304: quien pide un trozo lo
 * quiere.
 */
export async function conEtiqueta(
  peticion: Request,
  respuesta: Response,
  coleccion: string,
  nombre: string,
): Promise<Response> {
  if (respuesta.status !== 200 && respuesta.status !== 206) return respuesta
  const tamano = tamanoEntero(respuesta)
  if (!tamano) return respuesta

  const etiqueta = etiquetaDeArchivo(coleccion, nombre, tamano)
  const cabeceras = new Headers(respuesta.headers)
  cabeceras.set('ETag', etiqueta)

  if (respuesta.status === 200 && coincideLaEtiqueta(peticion.headers.get('if-none-match'), etiqueta)) {
    // Se suelta el archivo que Payload dejó abierto para leer.
    await respuesta.body?.cancel().catch(() => undefined)
    // Un 304 lleva las cabeceras de caché (las de `cacheDeArchivoPrivado`, con
    // su `Vary: Cookie`) y no las del cuerpo, que no va.
    for (const delCuerpo of ['Content-Length', 'Content-Range', 'Content-Type']) cabeceras.delete(delCuerpo)
    return new Response(null, { status: 304, headers: cabeceras })
  }
  return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers: cabeceras })
}
