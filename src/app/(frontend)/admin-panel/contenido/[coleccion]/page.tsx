import { notFound } from 'next/navigation'
import { exigirPanelPara } from '@/app/(frontend)/admin-panel/acceso'
import { esColeccionEditable, esquemaDe } from '@/admin/esquema'
import { TablaDocumentos } from '@/components/admin/TablaDocumentos'

export const dynamic = 'force-dynamic'

/**
 * Listado de una colección.
 *
 * La página solo resuelve el esquema y comprueba el acceso; los datos los pide
 * la tabla, porque el filtro y la paginación cambian sin recargar la página.
 */
export default async function PaginaDeColeccion({
  params,
}: {
  params: Promise<{ coleccion: string }>
}) {
  // El acceso se comprueba antes que la validez del slug: un 404 y una
  // redirección distinguibles le dirían a un curioso sin sesión qué colecciones
  // existen.
  const { coleccion } = await params
  await exigirPanelPara(coleccion)
  if (!esColeccionEditable(coleccion)) notFound()

  return <TablaDocumentos esquema={esquemaDe(coleccion)} />
}
