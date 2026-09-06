import { notFound, redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/sesion'
import { esColeccionEditable, esquemaDe } from '@/admin/esquema'
import { FormularioDocumento } from '@/components/admin/FormularioDocumento'
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
  const sesion = await obtenerSesion()
  if (!sesion?.usuario || sesion.rolReal !== 'admin') redirect('/')

  const { coleccion, id } = await params
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

  return (
    <FormularioDocumento
      esquema={esquema}
      documento={documento as unknown as Record<string, unknown>}
      id={id}
      rutaPublica={esModulo ? rutaPublica(esquema.slug, id) : null}
    />
  )
}
