import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { esNombreDeRespaldo } from '@/lib/respaldos'
import { rutaDeRespaldo } from '@/lib/respaldosServidor'

export const dynamic = 'force-dynamic'

/**
 * Descarga de un respaldo desde el panel.
 *
 * Un respaldo es la base entera —correos, contraseñas cifradas, todo el
 * contenido—, así que exige rol de administrador y no de editor. El nombre del
 * archivo se comprueba contra el patrón de los respaldos antes de tocar el
 * disco: sin eso, «..%2f..%2f.env» en la ruta sería una lectura arbitraria del
 * sistema de archivos.
 *
 * El archivo se transmite en flujo, no en memoria: pesa lo que pese la base.
 */
export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ archivo: string }> },
) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await siguientesCabeceras() })

  const esAdmin = Boolean(
    user && (user as { activo?: boolean }).activo && (user as { rol?: string }).rol === 'admin',
  )
  if (!esAdmin) return new Response('No autorizado', { status: 401 })

  const { archivo } = await params
  if (!esNombreDeRespaldo(archivo)) return new Response('No encontrado', { status: 404 })

  const ruta = rutaDeRespaldo(archivo)
  const info = await stat(ruta).catch(() => null)
  if (!info?.isFile()) return new Response('No encontrado', { status: 404 })

  const flujo = Readable.toWeb(createReadStream(ruta)) as ReadableStream

  return new Response(flujo, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Length': String(info.size),
      'Content-Disposition': `attachment; filename="${archivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
