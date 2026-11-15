import { notFound } from 'next/navigation'
import type { Payload } from 'payload'
import { exigirPanelPara } from '@/app/(frontend)/admin-panel/acceso'
import { esColeccionEditable, esquemaDe } from '@/admin/esquema'
import { FormularioDocumento } from '@/components/admin/FormularioDocumento'
import { UsosDelModelo } from '@/components/admin/UsosDelModelo'
import { puedeEditar } from '@/lib/guardias'
import { etiquetaDeModelo } from '@/lib/usosDeUnModelo'
import { modelosEnUso, usosDelModelo } from '@/lib/usosDeUnModeloServidor'
import { revisionParaElEditor } from '@/lib/revisionServidor'
import { clientePayload } from '../../../datos'
import { MODULOS, rutaPublica } from '../../../modulos'

export const dynamic = 'force-dynamic'

/**
 * «Dónde se usa» de un modelo 3D (D-372), con los modelos de su misma carpeta
 * para «Reemplazar por…». Solo se nombra lo que quien mira puede editar; el
 * resto se cuenta (ver `mensajeDeModeloEnUso`).
 */
async function anexoDelModelo(
  payload: Payload,
  id: string,
  modelo: Record<string, unknown>,
  usuario: Record<string, unknown>,
) {
  const [usos, enUso, mismaCarpeta] = await Promise.all([
    usosDelModelo(payload, id),
    modelosEnUso(payload),
    payload.find({
      collection: 'modelos-3d',
      where: { and: [{ clase: { equals: modelo.clase } }, { id: { not_equals: id } }] },
      depth: 0,
      pagination: false,
      sort: '-createdAt',
      overrideAccess: true,
      select: { nombre: true, createdAt: true },
    }),
  ])
  const visibles = usos.filter((u) => puedeEditar(usuario, u.coleccion))
  return (
    <UsosDelModelo
      modeloId={id}
      usos={visibles.map((u) => ({
        clave: `${u.coleccion}:${u.id}`,
        titulo: u.titulo,
        etiqueta: u.etiqueta,
        href: esColeccionEditable(u.coleccion) ? `/admin-panel/contenido/${u.coleccion}/${u.id}` : null,
      }))}
      ajenos={usos.length - visibles.length}
      candidatos={mismaCarpeta.docs.map((m) => ({ id: String(m.id), etiqueta: etiquetaDeModelo(m, enUso.has(String(m.id))) }))}
    />
  )
}

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
        profesion: (sesion.usuario as { profesion?: unknown }).profesion,
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
      usuarioId={String(sesion.usuario.id)}
      anexo={
        esquema.slug === 'modelos-3d'
          ? await anexoDelModelo(
              payload,
              id,
              documento as unknown as Record<string, unknown>,
              sesion.usuario as unknown as Record<string, unknown>,
            )
          : null
      }
    />
  )
}
