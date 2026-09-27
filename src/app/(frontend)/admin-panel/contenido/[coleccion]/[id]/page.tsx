import { notFound } from 'next/navigation'
import { exigirPanelPara } from '@/app/(frontend)/admin-panel/acceso'
import { esColeccionEditable, esquemaDe } from '@/admin/esquema'
import { FormularioDocumento } from '@/components/admin/FormularioDocumento'
import { revisionParaElEditor } from '@/lib/revisionServidor'
import { clientePayload } from '../../../datos'
import { MODULOS, rutaPublica } from '../../../modulos'

export const dynamic = 'force-dynamic'

/**
 * Edición de un documento existente.
 *
 * Se lee con `draft: true` para que el editor muestre lo último escrito y no
 * la última versión publicada: quien abre una ficha a medias espera encontrar
 * donde la dejó.
 */
export default async function PaginaEditarDocumento({
  params,
}: {
  params: Promise<{ coleccion: string; id: string }>
}) {
  const { coleccion, id } = await params
  const { sesion, esAdmin } = await exigirPanelPara(coleccion)
  if (!esColeccionEditable(coleccion)) notFound()
  const esquema = esquemaDe(coleccion)

  const payload = await clientePayload()
  const documento = await payload
    .findByID({
      collection: esquema.slug as never,
      id,
      depth: 1,
      draft: esquema.versionada,
      overrideAccess: true,
    })
    .catch(() => null)

  if (!documento) notFound()

  const esModulo = MODULOS.some((m) => m.slug === esquema.slug)

  // La revisión de la ficha, si está en revisión (D-142). Si su tabla no
  // responde, la ficha se abre igual, sin ella: dejar a alguien sin poder
  // editar por un fallo de la auditoría sería peor que editar sin medir.
  const revision = esModulo
    ? await revisionParaElEditor(payload, esquema.slug, id, {
        id: String(sesion.usuario.id),
        esAdmin,
      }).catch((error: unknown) => {
        console.error('[revision] no se pudo leer la revisión de la ficha:', error)
        return null
      })
    : null

  return (
    <FormularioDocumento
      esquema={esquema}
      documento={documento as unknown as Record<string, unknown>}
      id={id}
      rutaPublica={esModulo ? rutaPublica(esquema.slug, id) : null}
      revision={revision}
      esAdmin={esAdmin}
    />
  )
}
