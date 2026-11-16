import { ErrorDeAcceso, exigirAdminCentral } from '@/lib/guardias'
import { exportarInstitucion } from '@/lib/exportarInstitucionServidor'
import { registrarAccion } from '@/lib/registroServidor'
import { marcaDeTiempo } from '@/lib/respaldos'

export const dynamic = 'force-dynamic'

const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * El contenido de una institución en un ZIP (P-016 E5.8, D-403): lo que creó,
 * para devolvérselo antes de que se borren sus cuentas. Qué lleva y qué no,
 * en `src/lib/exportarInstitucionServidor.ts`.
 *
 * Una ruta y no una acción de servidor, como los datos de una cuenta: es un
 * archivo. Solo del administrador de TraumaHub (`exigirAdminCentral`): el de
 * una institución no lo necesita mientras puede entrar, y cuando ya no puede,
 * tampoco podría descargarlo. La guardia está aquí porque una ruta se alcanza
 * sin pasar por la pantalla que la ofrece.
 *
 * Cada descarga queda en el registro, a nombre de quien la hizo: sacar de la
 * plataforma lo que escribió una institución es lo que el registro tiene que
 * poder contar después.
 */
export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  let contexto: Awaited<ReturnType<typeof exigirAdminCentral>>
  try {
    contexto = await exigirAdminCentral()
  } catch (error) {
    if (error instanceof ErrorDeAcceso) return new Response('No autorizado', { status: 403 })
    throw error
  }

  const { id } = await params
  // Solo números: los identificadores lo son, y así lo que llega en la ruta no
  // viaja a la consulta.
  if (!/^\d{1,12}$/.test(id)) return new Response('No encontrado', { status: 404 })

  const exportacion = await exportarInstitucion(contexto.payload, Number(id))
  if (!exportacion) return new Response('No encontrado', { status: 404 })

  const documentos = Object.values(exportacion.documentos).reduce((total, n) => total + n, 0)
  await registrarAccion(contexto.payload, {
    accion: 'exportacion-de-institucion',
    usuario: contexto.usuario,
    coleccion: 'instituciones',
    documentoId: id,
    titulo: exportacion.nombre,
    detalle:
      `Descargó su contenido: ${cuantos(documentos, 'documento', 'documentos')} y ` +
      `${cuantos(exportacion.archivos, 'archivo', 'archivos')}.` +
      (exportacion.fuera.length ? ` Quedaron fuera ${cuantos(exportacion.fuera.length, 'archivo', 'archivos')}.` : ''),
  })

  return new Response(new Blob([exportacion.zip as BlobPart]), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="traumahub-${exportacion.subdominio}-contenido-${marcaDeTiempo()}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
