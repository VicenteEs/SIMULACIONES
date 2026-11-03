import { Hourglass } from 'lucide-react'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { MODULOS_ANUNCIADOS, ROTULO_PROXIMAMENTE } from '@/lib/modulosAnunciados'
import { Hilo } from './Hilo'
import { Resaltado } from './Resaltado'

/**
 * El módulo 06, anunciado (D-163): el hilo sigue, pero punteado, porque ese
 * tramo todavía no existe.
 *
 * Sale si hay un módulo anunciado y si su antetítulo no está vacío: lo primero
 * lo decide el código (`MODULOS_ANUNCIADOS`), lo segundo el administrador, que
 * puede quitar la sección vaciándolo. El texto es de «Medios de la página»; la
 * insignia, la misma de siempre, para que la portada y la página del módulo
 * digan lo mismo con la misma palabra.
 */
export function Proximamente({ pagina }: { pagina: PaginaLeida }) {
  const t = (clave: string) => pagina.texto(`portada.proximamente.${clave}`)
  if (MODULOS_ANUNCIADOS.length === 0 || !t('antetitulo')) return null

  return (
    <section className="p-proximamente p-claro" aria-labelledby="p-proximamente-titular">
      <Hilo forma="recto" />
      <div className="p-contenedor p-centrado">
        <span className="p-nodo p-nodo-punteado" aria-hidden="true">
          <Hourglass size={18} />
        </span>
        <p className="p-antetitulo">
          {t('antetitulo')} <span className="insignia-proximamente">{ROTULO_PROXIMAMENTE}</span>
        </p>
        <h2 id="p-proximamente-titular" className="p-titular p-titular-medio">
          <Resaltado texto={t('titular')} />
        </h2>
        {t('bajada') ? <p className="p-bajada">{t('bajada')}</p> : null}
      </div>
      <span className="p-hilo-punteado" aria-hidden="true" />
    </section>
  )
}
