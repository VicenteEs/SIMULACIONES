import { Library, Mail, ShieldCheck } from 'lucide-react'
import { LogoChessCore } from '@/components/LogoChessCore'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { Hilo } from './Hilo'
import { Resaltado } from './Resaltado'

const ICONOS = [ShieldCheck, Library] as const

/** Las iniciales para el círculo de la tarjeta: la primera letra del primer nombre y del primer apellido. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  const primera = partes[0]?.[0] ?? ''
  // «Ana María Pérez Soto» → «AP»: con cuatro palabras, la tercera es
  // el primer apellido; con dos o tres, la última palabra lo es casi siempre.
  const apellido = partes.length >= 4 ? partes[2] : partes.length > 1 ? partes[partes.length - 1] : ''
  return `${primera}${apellido?.[0] ?? ''}`.toUpperCase()
}

/**
 * «Sobre nosotros»: quién desarrolla la plataforma, dos sellos de confianza y
 * dos tarjetas, la de la empresa y la de la persona.
 *
 * No lee la colección `equipo`: esa la lee solo quien tiene cuenta, porque la
 * pestaña «Equipo» es de la plataforma cerrada (D-217), y esta página la ve
 * cualquiera. Las dos tarjetas son texto de «Medios de la página», y una con el
 * nombre vacío no se pinta. Penpot dibujaba dos tarjetas más, punteadas y
 * marcadas «Ejemplo»: aquí no están, porque en una página pública una persona
 * de ejemplo se lee como una persona.
 */
export function SobreNosotros({ pagina }: { pagina: PaginaLeida }) {
  const t = (clave: string) => pagina.texto(`portada.nosotros.${clave}`)
  const correo = pagina.texto('general.correo')
  const sellos = [1, 2]
    .map((n, i) => ({ n, titulo: t(`sello-${n}.titulo`), texto: t(`sello-${n}.texto`), Icono: ICONOS[i] }))
    .filter((s) => s.titulo)
  const empresa = t('empresa.nombre')
  const persona = t('persona.nombre')

  return (
    <section id="nosotros" data-ancla="nosotros" className="p-nosotros p-claro" aria-labelledby="p-nosotros-titular">
      <Hilo forma="izquierda" />
      <div className="p-contenedor p-dos-columnas">
        <div>
          <p className="p-antetitulo">{t('antetitulo')}</p>
          <h2 id="p-nosotros-titular" className="p-titular">
            <Resaltado texto={t('titular')} />
          </h2>
          <p className="p-bajada">{t('bajada')}</p>
          {sellos.length > 0 ? (
            <ul className="p-puntos">
              {sellos.map(({ n, titulo, texto, Icono }) => (
                <li key={n} className="p-punto">
                  <span className="p-icono-caja" aria-hidden="true">
                    <Icono size={18} />
                  </span>
                  <span>
                    <strong>{titulo}</strong>
                    {texto ? <span className="p-punto-texto">{texto}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <a className="p-correo" href={`mailto:${correo}`}>
            <Mail size={16} aria-hidden /> {correo}
          </a>
        </div>

        <div className="p-tarjetas-equipo">
          <span className="p-nodo" aria-hidden="true">
            Eq
          </span>
          {empresa ? (
            <article className="p-tarjeta-equipo">
              <span className="p-tarjeta-logo">
                <LogoChessCore sobre="papel" alto={44} />
              </span>
              <h3>{empresa}</h3>
              {t('empresa.cargo') ? <p className="p-tarjeta-cargo">{t('empresa.cargo')}</p> : null}
              {t('empresa.texto') ? <p className="p-tarjeta-texto">{t('empresa.texto')}</p> : null}
            </article>
          ) : null}
          {persona ? (
            <article className="p-tarjeta-equipo p-tarjeta-equipo-baja">
              <span className="p-avatar" aria-hidden="true">
                {iniciales(persona)}
              </span>
              <h3>{persona}</h3>
              {t('persona.cargo') ? <p className="p-tarjeta-cargo">{t('persona.cargo')}</p> : null}
              <p className="p-tarjeta-texto">{correo}</p>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  )
}
