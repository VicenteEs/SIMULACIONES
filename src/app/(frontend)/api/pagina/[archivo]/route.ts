import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { getPayload } from 'payload'
import config from '@payload-config'
import { cabecerasDeArchivoPublico } from '@/collections/hooks/cacheDeArchivos'
import { fotoPublica } from '@/lib/mediosDeLaPagina'

export const dynamic = 'force-dynamic'

/**
 * Las fotos de la portada y de `/planes`, sin sesión (P-007 E2).
 *
 * Es la única puerta pública a un archivo subido, y por eso es estrecha. No
 * sirve «lo que haya en `medios/pagina`»: sirve un nombre solo si es la foto
 * vigente de un espacio de la página (`fotoPublica`), que es exactamente lo que
 * la portada enseña. La colección sigue cerrada (D-020) y Payload sigue
 * sirviendo su propia copia en `/api/medios-pagina/file/…`, que exige sesión de
 * administrador.
 *
 * El camino del disco no se arma con lo que llega: el nombre se comprueba contra
 * `NOMBRE_DE_FOTO` —letras, números, guiones y una extensión de imagen—, se
 * busca en la base y se sirve el de la fila. Y aun así se comprueba que el
 * camino resuelto quede dentro de la carpeta, por si un día alguien afloja el
 * filtro.
 */

/** Payload resuelve su `staticDir` relativo contra el directorio de trabajo, y aquí igual. */
const CARPETA = resolve('medios', 'pagina')

const noEsta = () =>
  new Response('No encontrado.', {
    status: 404,
    // `no-store`: una foto que todavía no se ha subido no puede quedarse
    // guardada como «no existe» en la caché de nadie.
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  })

export async function GET(_peticion: Request, { params }: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await params
  try {
    const payload = await getPayload({ config })
    const foto = await fotoPublica(payload, archivo)
    if (!foto) return noEsta()

    const camino = resolve(CARPETA, foto.nombre)
    if (!camino.startsWith(CARPETA + sep)) return noEsta()
    const datos = await stat(camino).catch(() => null)
    // La fila existe pero el archivo no: el volumen no se montó, o se restauró
    // la base sin los medios. La portada pinta la original (`ImagenConCarga`).
    if (!datos?.isFile()) return noEsta()

    const cabeceras = cabecerasDeArchivoPublico(new Headers())
    cabeceras.set('Content-Type', foto.tipo)
    cabeceras.set('Content-Length', String(datos.size))
    return new Response(Readable.toWeb(createReadStream(camino)) as ReadableStream, { status: 200, headers: cabeceras })
  } catch (fallo) {
    console.error('[pagina] no se pudo servir la foto', fallo)
    return new Response('No se pudo leer la foto.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}
