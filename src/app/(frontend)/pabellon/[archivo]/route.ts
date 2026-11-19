import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { obtenerSesion } from '@/lib/sesion'
import { archivoDelPabellon, yaLaTiene } from '@/lib/archivosDelPabellon'
import { cabecerasDelPabellon } from '@/collections/hooks/cacheDeArchivos'

export const dynamic = 'force-dynamic'

/**
 * Los modelos del pabellón del simulador, solo con sesión (D-419).
 *
 * Responde en la misma dirección que antes servía `public/pabellon/`, así que el
 * simulador los pide igual (`ruta('/pabellon/…')`). Lo que cambia es que ahora
 * alguien pregunta: la cuenta tiene que estar activa y valer en el lugar al que
 * llega la petición (`obtenerSesion`, que mira la institución del subdominio).
 * Es la misma condición que la página del simulador y que los modelos subidos
 * (`lecturaSimple`): no tiene sentido que el pabellón pida más que el hueso.
 *
 * La sesión se mira antes que el nombre. Al revés, un 404 o un 403 según el
 * archivo exista o no le diría a quien no tiene cuenta qué hay en la carpeta.
 *
 * Que el archivo no viaje a quien no tiene cuenta es lo que esto asegura. Quien
 * sí la tiene se lo lleva igual: el navegador lo recibe entero para dibujarlo.
 */

const sinCuerpo = (status: number, texto: string) =>
  new Response(texto, {
    status,
    // `no-store`: la negativa no se guarda, ni en el navegador ni en Cloudflare.
    // Quien entra después tiene que recibir el archivo, no el «no» de antes.
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  })

export async function GET(peticion: Request, { params }: { params: Promise<{ archivo: string }> }) {
  const { activo } = await obtenerSesion()
  if (!activo) return sinCuerpo(403, 'Hace falta iniciar sesión.')

  const { archivo } = await params
  const encontrado = await archivoDelPabellon(archivo)
  if (!encontrado) return sinCuerpo(404, 'No encontrado.')

  const cabeceras = cabecerasDelPabellon(new Headers())
  cabeceras.set('ETag', encontrado.huella)
  if (yaLaTiene(peticion.headers.get('if-none-match'), encontrado.huella)) {
    return new Response(null, { status: 304, headers: cabeceras })
  }
  cabeceras.set('Content-Type', encontrado.tipo)
  cabeceras.set('Content-Length', String(encontrado.bytes))
  return new Response(Readable.toWeb(createReadStream(encontrado.camino)) as ReadableStream, { status: 200, headers: cabeceras })
}
