import { Layers, Library, Scissors } from 'lucide-react'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { CarruselDelProblema, type TarjetaDelProblema } from './CarruselDelProblema'
import { Hilo } from './Hilo'
import { Resaltado } from './Resaltado'

const ICONOS = [Layers, Scissors, Library] as const

/**
 * «El problema»: a la izquierda el planteamiento y su frase, a la derecha lo
 * que cambia, en tarjetas que pasan solas (D-272).
 *
 * El «antes» va tachado con `<s>` y no solo con CSS: un lector de pantalla
 * anuncia que el texto está tachado, y sin eso leería las dos frases como si
 * las dos fueran lo que ofrece la plataforma. Una tarjeta sin título ni frase
 * no se pinta: el administrador la quita vaciándola. Los puntos vacíos
 * tampoco, así que una tarjeta puede llevar de cero a tres.
 *
 * Los iconos se pintan aquí y llegan al carrusel ya hechos: una función no
 * cruza del servidor al cliente, un elemento sí.
 */
export function ElProblema({ pagina }: { pagina: PaginaLeida }) {
  const t = (clave: string) => pagina.texto(`portada.problema.${clave}`)
  const tarjetas: TarjetaDelProblema[] = [1, 2, 3]
    .map((n, i) => {
      const Icono = ICONOS[i]
      return {
        antes: t(`fila-${n}.antes`),
        titulo: t(`fila-${n}.titulo`),
        con: t(`fila-${n}.con`),
        puntos: [1, 2, 3].map((k) => t(`fila-${n}.punto-${k}`)).filter(Boolean),
        icono: <Icono size={22} />,
      }
    })
    .filter((f) => f.titulo || f.con)
  const cita = t('cita')

  return (
    <section id="problema" data-ancla="problema" className="p-problema p-oscuro" aria-labelledby="p-problema-titular">
      <Hilo forma="izquierda" />
      <div className="p-contenedor p-dos-columnas p-problema-rejilla">
        <div>
          <p className="p-antetitulo">{t('antetitulo')}</p>
          <h2 id="p-problema-titular" className="p-titular">
            <Resaltado texto={t('titular')} />
          </h2>
          <p className="p-bajada">{t('bajada')}</p>
          {/* Las comillas las pone la página y no el texto: el administrador
              escribe la frase y no tiene que acordarse de cuáles van. */}
          {cita ? <p className="p-problema-cita">«{cita}»</p> : null}
        </div>
        {tarjetas.length > 0 ? <CarruselDelProblema tarjetas={tarjetas} /> : null}
      </div>
    </section>
  )
}
