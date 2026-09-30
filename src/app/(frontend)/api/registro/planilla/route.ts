import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { crearPlanilla } from '@/lib/planilla'
import { hojasDelRegistro } from '@/lib/registroPanel'
import { marcaDeTiempo } from '@/lib/respaldos'

export const dynamic = 'force-dynamic'

/**
 * La planilla del registro de acciones, para abrirla en Excel (D-145).
 *
 * Cuatro hojas: el registro, las cuentas con su tiempo activo, el tiempo por
 * día y los permisos por rol. Una ruta y no una acción de servidor, y solo
 * para el administrador, por lo mismo que la de la auditoría: es un archivo, y
 * dice qué hace cada persona y cuánto tiempo.
 */
export async function GET() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await siguientesCabeceras() })
  const esAdmin = Boolean(
    user && (user as { activo?: boolean }).activo && (user as { rol?: string }).rol === 'admin',
  )
  if (!esAdmin) return new Response('No autorizado', { status: 401 })

  const bytes = crearPlanilla(await hojasDelRegistro(payload), {
    titulo: 'Registro de acciones y tiempo de actividad',
    autor: 'TraumaHub',
  })
  return new Response(new Blob([bytes as BlobPart]), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="registro-${marcaDeTiempo()}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
