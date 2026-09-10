import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
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
  await exigirPanel()

  return <TallerDeAtlas />
}
