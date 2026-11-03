import { Layers, Library, Scissors } from 'lucide-react'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { Hilo } from './Hilo'
import { Resaltado } from './Resaltado'

const ICONOS = [Layers, Scissors, Library] as const

/**
 * «El problema»: lo de siempre tachado y, debajo, lo que cambia.
 *
 * El «antes» va tachado con `<s>` y no solo con CSS: un lector de pantalla
 * anuncia que el texto está tachado, y sin eso leería las dos frases como si
 * las dos fueran lo que ofrece la plataforma. Una fila sin «con TraumaHub» no
 * se pinta: el administrador la quita vaciándola.
 */
export function ElProblema({ pagina }: { pagina: PaginaLeida }) {
  const t = (clave: string) => pagina.texto(`portada.problema.${clave}`)
  const filas = [1, 2, 3]
    .map((n, i) => ({ antes: t(`fila-${n}.antes`), con: t(`fila-${n}.con`), Icono: ICONOS[i] }))
    .filter((f) => f.con)

  return (
    <section id="problema" data-ancla="problema" className="p-problema p-oscuro" aria-labelledby="p-problema-titular">
      <Hilo forma="izquierda" />
      <div className="p-contenedor p-dos-columnas">
        <div>
          <p className="p-antetitulo">{t('antetitulo')}</p>
          <h2 id="p-problema-titular" className="p-titular">
            <Resaltado texto={t('titular')} />
          </h2>
          <p className="p-bajada">{t('bajada')}</p>
        </div>
        <ul className="p-problema-filas">
          {filas.map(({ antes, con, Icono }) => (
            <li key={con} className="p-problema-fila">
              {antes ? (
                <p className="p-problema-antes">
                  <span className="p-rotulo-mono">Antes</span> <s>{antes}</s>
                </p>
              ) : null}
              <div className="p-problema-con">
                <span className="p-icono-caja" aria-hidden="true">
                  <Icono size={18} />
                </span>
                <p>
                  <span className="p-rotulo-mono">Con TraumaHub</span>
                  <strong>{con}</strong>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
