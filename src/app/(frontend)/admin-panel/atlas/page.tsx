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
export default async function PaginaAtlas({
  searchParams,
}: {
  searchParams: Promise<{ preparacion?: string | string[]; comentario?: string | string[] }>
}) {
  const { esAdmin } = await exigirPanel()

  // El enlace de la bandeja de comentarios (E2, D-158): abre esta preparación y
  // señala este comentario. Son identificadores de fila; lo que no lo parezca se
  // ignora y el taller abre como siempre, en vez de pasar al navegador texto
  // arbitrario de la dirección.
  const parametros = await searchParams
  const soloNumero = (v: string | string[] | undefined) => {
    const t = Array.isArray(v) ? v[0] : v
    return t && /^\d{1,12}$/.test(t) ? t : undefined
  }
  const preparacionInicial = soloNumero(parametros.preparacion)
  const comentarioInicial = preparacionInicial ? soloNumero(parametros.comentario) : undefined

  // La clase la mira `admin.css` para soltar el ancho máximo del panel (D-139):
  // el taller son tres columnas y quiere toda la pantalla.
  return (
    <div className="atlas-taller">
      <TallerDeAtlas
        esAdmin={esAdmin}
        preparacionInicial={preparacionInicial}
        comentarioInicial={comentarioInicial}
      />
    </div>
  )
}
