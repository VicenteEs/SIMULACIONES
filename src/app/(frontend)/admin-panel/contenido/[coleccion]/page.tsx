import { notFound, redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/sesion'
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
  const sesion = await obtenerSesion()
  if (!sesion?.usuario || sesion.rolReal !== 'admin') redirect('/')

  const { coleccion } = await params
  if (!esColeccionEditable(coleccion)) notFound()

  return <TablaDocumentos esquema={esquemaDe(coleccion)} />
}
