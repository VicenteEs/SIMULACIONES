import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/sesion'
import { TallerDeAtlas } from '@/components/admin/atlas/TallerDeAtlas'

export const dynamic = 'force-dynamic'

/**
 * Taller anatómico.
 *
 * Entran administrador y editor: el traumatólogo que prepara el contenido es el
 * rol editor, y este es su banco de trabajo. La página solo comprueba el acceso;
 * el catálogo lo pide el navegador, porque son 0,7 MB que conviene que queden
 * en su caché y no que viajen dentro de cada respuesta del servidor.
 */
export default async function PaginaAtlas() {
  const sesion = await obtenerSesion()
  const rol = sesion.rolReal
  if (!sesion?.usuario || !sesion.activo || (rol !== 'admin' && rol !== 'editor')) {
    redirect('/')
  }

  return <TallerDeAtlas />
}
