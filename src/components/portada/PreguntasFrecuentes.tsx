import { Mail } from 'lucide-react'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { Hilo } from './Hilo'
import { Resaltado } from './Resaltado'

/**
 * Las preguntas frecuentes, como acordeón.
 *
 * Con `<details>` y no con un componente de cliente: abrir y cerrar, el
 * teclado y lo que anuncia un lector de pantalla los pone el navegador, y la
 * página no carga JavaScript para esto. El atributo `name` hace que abrir una
 * cierre la otra, como en Penpot; el navegador que no lo conoce las deja
 * abrirse a la vez, que también se lee bien. La primera sale abierta: un
 * acordeón cerrado entero parece una lista de títulos.
 *
 * Seis casillas: la que tiene la pregunta vacía no se pinta, y así el
 * administrador quita o añade preguntas sin tocar código.
 *
 * La usan la portada y `/planes`, cada una con sus espacios (`prefijo`). En
 * `/planes` va sin el hilo y sin su nodo: allí no hay capítulos que unir.
 */
export function PreguntasFrecuentes({
  pagina,
  prefijo = 'portada.preguntas',
  conHilo = true,
}: {
  pagina: PaginaLeida
  prefijo?: string
  conHilo?: boolean
}) {
  const t = (clave: string) => pagina.texto(`${prefijo}.${clave}`)
  const correo = pagina.texto('general.correo')
  const preguntas = [1, 2, 3, 4, 5, 6]
    .map((n) => ({
      n,
      pregunta: t(`pregunta-${n}`),
      respuesta: t(`respuesta-${n}`),
    }))
    .filter((p) => p.pregunta && p.respuesta)
  if (preguntas.length === 0) return null

  return (
    <section id="preguntas" data-ancla="preguntas" className="p-preguntas p-claro" aria-labelledby="p-preguntas-titular">
      {conHilo ? <Hilo forma="derecha" /> : null}
      <div className="p-contenedor p-dos-columnas p-preguntas-rejilla">
        <div className="p-preguntas-cabecera">
          {conHilo ? (
            <span className="p-nodo" aria-hidden="true">
              ?
            </span>
          ) : null}
          <p className="p-antetitulo">{t('antetitulo')}</p>
          <h2 id="p-preguntas-titular" className="p-titular">
            <Resaltado texto={t('titular')} />
          </h2>
          {t('bajada') ? <p className="p-bajada">{t('bajada')}</p> : null}
          <a className="p-correo" href={`mailto:${correo}`}>
            <Mail size={16} aria-hidden /> {correo}
          </a>
        </div>
        <div className="p-acordeon">
          {preguntas.map(({ n, pregunta, respuesta }, i) => (
            <details key={n} name="preguntas-frecuentes" open={i === 0} className="p-acordeon-item">
              <summary>
                <span>{pregunta}</span>
                <span className="p-acordeon-signo" aria-hidden="true" />
              </summary>
              <p>{respuesta}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
