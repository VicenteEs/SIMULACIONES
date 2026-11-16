import { ruta } from '@/lib/rutas'
import type { ConfiguracionDelContador } from '@/lib/contador'

/**
 * El guion de Umami en cada página (P-016 E7, D-408), servido por la propia
 * plataforma (`api/visitas/guion.js`) y mandando las visitas a ella.
 *
 * Los dos caminos pasan por `ruta()`: son direcciones escritas a mano, y bajo
 * un prefijo saldrían hacia la página vecina del mismo dominio (AGENTS.md).
 *
 * - `data-exclude-search` y `data-exclude-hash`: el guion ni siquiera manda la
 *   consulta ni el fragmento, donde viajan los enlaces de invitación. La ruta
 *   que recibe las visitas los quita igual, por si el guion cambiara.
 * - `data-do-not-track`: quien pidió a su navegador no ser seguido no se cuenta.
 *
 * Un `<script>` corriente y no `next/script`: lo pinta el servidor en el HTML
 * de la primera carga, y el guion de Umami sigue solo los cambios de página
 * que hace Next en el navegador, porque escucha `history.pushState`.
 */
export function ContadorDeVisitas({ configuracion }: { configuracion: Pick<ConfiguracionDelContador, 'sitio'> }) {
  return (
    <script
      defer
      src={ruta('/api/visitas/guion.js')}
      data-website-id={configuracion.sitio}
      data-host-url={ruta('/api/visitas')}
      data-exclude-search="true"
      data-exclude-hash="true"
      data-do-not-track="true"
    />
  )
}
