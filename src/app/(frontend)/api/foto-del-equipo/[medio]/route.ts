import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { getPayload } from 'payload'
import config from '@payload-config'
import { cabecerasDeFotoDelEquipo } from '@/collections/hooks/cacheDeArchivos'
import { fotoDelEquipoPublica } from '@/lib/equipoPublico'

export const dynamic = 'force-dynamic'

/**
 * Las fotos del equipo en la portada, sin sesión (D-277).
 *
 * Hace falta porque la foto de un colaborador vive en `medios`, que Payload
 * sirve solo con sesión (`/api/medios/file/…`, D-020): en la portada, que la ve
 * cualquiera, la tarjeta se quedaba con un recuadro roto. Esta ruta no abre esa
 * colección: entrega un archivo solo si es la foto de alguien del equipo
 * (`fotoDelEquipoPublica`), igual que `api/pagina/[archivo]` entrega solo la foto
 * vigente de un espacio de la página.
 *
 * Lo que llega es un número y no un nombre de archivo. El nombre sale de la
 * fila, y aun así se comprueba que el camino resuelto quede dentro de la
 * carpeta, por si un día una fila trae lo que no debe.
 */

/** Payload resuelve el `staticDir` de `medios` relativo al directorio de trabajo, y aquí igual. */
const CARPETA = resolve('medios')

const noEsta = () =>
  new Response('No encontrado.', {
    status: 404,
    // `no-store`: una foto que se pone después no puede quedarse guardada como
    // «no existe» en la caché de nadie.
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  })

export async function GET(_peticion: Request, { params }: { params: Promise<{ medio: string }> }) {
  const { medio } = await params
  try {
    const payload = await getPayload({ config })
    const foto = await fotoDelEquipoPublica(payload, medio)
    if (!foto) return noEsta()

    const camino = resolve(CARPETA, foto.nombre)
    if (!camino.startsWith(CARPETA + sep)) return noEsta()
    const datos = await stat(camino).catch(() => null)
    // La fila existe pero el archivo no: el volumen no se montó, o se restauró
    // la base sin los medios.
    if (!datos?.isFile()) return noEsta()

    const cabeceras = cabecerasDeFotoDelEquipo(new Headers())
    cabeceras.set('Content-Type', foto.tipo)
    cabeceras.set('Content-Length', String(datos.size))
    return new Response(Readable.toWeb(createReadStream(camino)) as ReadableStream, { status: 200, headers: cabeceras })
  } catch (fallo) {
    console.error('[equipo] no se pudo servir la foto', fallo)
    return new Response('No se pudo leer la foto.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}
