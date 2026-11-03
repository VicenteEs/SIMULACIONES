import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { leerCambios } from '@/lib/mediosDeLaPagina'
import { clientePayload } from '../datos'
import { PanelDeMediosDeLaPagina, type CambiosParaElPanel } from './PanelDeMediosDeLaPagina'
import './medios-pagina.css'

export const dynamic = 'force-dynamic'

/**
 * «Medios de la página»: las fotos y los textos comerciales de la portada y de
 * `/planes`, que el administrador cambia sin tocar código (P-007 E2).
 *
 * Se llama así y no «Medios» por pedido del dueño: «Medios» ya es la colección
 * de imágenes y videos del contenido clínico, y dos pestañas con el mismo
 * nombre sobre cosas distintas se confunden. Por dentro, `medios-pagina`.
 *
 * Esta página solo lee lo cambiado; qué se puede cambiar y cuál es el original
 * lo sabe `src/lib/espaciosDeLaPagina.ts`, que la pantalla importa entero.
 */
export default async function PaginaMediosDeLaPagina() {
  await exigirPanel('admin')

  // Si la lectura falla —lo corriente: se desplegó sin la migración de estas
  // dos tablas—, se dice. Pintar la pestaña con todo «Original» haría creer que
  // no hay nada cambiado, y guardar encima fallaría sin que se supiera por qué.
  const cambios = await clientePayload()
    .then(leerCambios)
    .catch((error: unknown) => {
      console.error('[panel] no se pudieron leer los medios de la página:', error)
      return null
    })

  if (!cambios) {
    return (
      <div>
        <CabeceraDePagina titulo="Medios de la página" />
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudo leer lo cambiado en las páginas públicas.</strong> La consulta falló; lo
          corriente es que falten las tablas de esta pestaña —un cambio de esquema desplegado sin su
          migración—. La portada sigue saliendo con sus textos y fotos originales. El detalle queda en
          el registro del servidor.
        </div>
      </div>
    )
  }

  const paraElPanel: CambiosParaElPanel = {
    fotos: Object.fromEntries(cambios.fotos),
    textos: Object.fromEntries(cambios.textos),
  }

  return <PanelDeMediosDeLaPagina cambios={paraElPanel} />
}
