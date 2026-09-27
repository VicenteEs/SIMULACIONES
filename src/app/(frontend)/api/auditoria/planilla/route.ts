import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { leerAuditoria } from '@/lib/auditoriaServidor'
import { crearPlanilla } from '@/lib/planilla'
import { hojasDeLaAuditoria } from '@/lib/planillaDeAuditoria'
import { marcaDeTiempo } from '@/lib/respaldos'

export const dynamic = 'force-dynamic'

/**
 * La planilla de la auditoría, para abrirla en Excel y filtrarla (D-142, D-143).
 *
 * Una ruta y no una acción de servidor porque lo que se entrega es un archivo:
 * el navegador lo descarga con un enlace normal, con su nombre, sin pasar por
 * JavaScript. Exige administrador, como la pantalla de la que sale: dice
 * cuánto tardó cada revisor en cada ficha, y eso no es para cualquiera.
 */
export async function GET() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await siguientesCabeceras() })
  const esAdmin = Boolean(
    user && (user as { activo?: boolean }).activo && (user as { rol?: string }).rol === 'admin',
  )
  if (!esAdmin) return new Response('No autorizado', { status: 401 })

  const auditoria = await leerAuditoria(payload)
  const bytes = crearPlanilla(hojasDeLaAuditoria(auditoria), {
    titulo: 'Auditoría de la revisión del contenido',
    autor: 'TraumaHub',
  })
  const nombre = `auditoria-${marcaDeTiempo()}.xlsx`

  return new Response(new Blob([bytes as BlobPart]), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
