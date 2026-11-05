import { Library, Mail, ShieldCheck } from 'lucide-react'
import { LogoChessCore } from '@/components/LogoChessCore'
import type { ColaboradorPublico } from '@/lib/equipoPublico'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { Hilo } from './Hilo'
import { Resaltado } from './Resaltado'
import { TarjetaDelEquipo } from './TarjetaDelEquipo'

const ICONOS = [ShieldCheck, Library] as const

/**
 * Las iniciales para el círculo de la tarjeta sin foto: la primera letra del
 * primer nombre y del primer apellido.
 *
 * El tratamiento no cuenta, como en `src/lib/iniciales.ts`: con «Dr.» delante,
 * el nombre tenía una palabra de más, la tercera dejaba de ser el apellido y
 * el círculo de un médico decía «D» y la inicial de su segundo nombre. Se
 * quita toda palabra que termina en punto —«Dr.», «Dra.», «Prof.», «Klgo.»— y
 * «Dr» o «Dra» sin él.
 */
export function iniciales(nombre: string): string {
  const partes = nombre
    .trim()
    .split(/\s+/)
    .filter((p) => p && !p.endsWith('.') && !/^(dr|dra)$/i.test(p))
  const primera = partes[0]?.[0] ?? ''
  // «Ana María Pérez Soto» → «AP»: con cuatro palabras, la tercera es
  // el primer apellido; con dos o tres, la última palabra lo es casi siempre.
  const apellido = partes.length >= 4 ? partes[2] : partes.length > 1 ? partes[partes.length - 1] : ''
  return `${primera}${apellido?.[0] ?? ''}`.toUpperCase()
}

/**
 * «Sobre nosotros»: quién desarrolla la plataforma, dos sellos de confianza y
 * las tarjetas del equipo.
 *
 * La de Chesscore va siempre primero y es texto de «Medios de la página»: con
 * el nombre vacío no se pinta. Detrás, una tarjeta por cada colaborador de la
 * pestaña «Equipo», en su orden (D-277). Antes la segunda tarjeta era también
 * texto de la página, con un nombre y un cargo escritos a mano, y por eso un
 * cargo nuevo guardado en «Equipo» no llegaba nunca aquí: ahora solo salen los
 * de la pestaña, y lo que se guarda allí es lo que se ve.
 *
 * Todas las tarjetas miden lo mismo, y la que no cabe en ese alto se abre con
 * «Ver más» (D-278): eso lo resuelve `TarjetaDelEquipo`, que mide en el
 * navegador. Lo de dentro se pinta aquí, en el servidor.
 *
 * Penpot dibujaba dos tarjetas más, punteadas y marcadas «Ejemplo»: no están,
 * porque en una página pública una persona de ejemplo se lee como una persona.
 */
export function SobreNosotros({ pagina, equipo }: { pagina: PaginaLeida; equipo: readonly ColaboradorPublico[] }) {
  const t = (clave: string) => pagina.texto(`portada.nosotros.${clave}`)
  const correo = pagina.texto('general.correo')
  const sellos = [1, 2]
    .map((n, i) => ({ n, titulo: t(`sello-${n}.titulo`), texto: t(`sello-${n}.texto`), Icono: ICONOS[i] }))
    .filter((s) => s.titulo)
  const empresa = t('empresa.nombre')
  // Las tarjetas de la columna derecha bajan un poco, como la segunda del
  // diseño. La columna se cuenta con la de la empresa delante, que puede no
  // estar: sin ella, el primer colaborador pasa a la izquierda.
  const delante = empresa ? 1 : 0

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
            <TarjetaDelEquipo nombre={empresa}>
              <span className="p-tarjeta-logo">
                <LogoChessCore sobre="papel" alto={44} />
              </span>
              <h3>{empresa}</h3>
              {t('empresa.cargo') ? <p className="p-tarjeta-cargo">{t('empresa.cargo')}</p> : null}
              {t('empresa.texto') ? <p className="p-tarjeta-texto">{t('empresa.texto')}</p> : null}
            </TarjetaDelEquipo>
          ) : null}
          {equipo.map((colaborador, i) => (
            <TarjetaDelEquipo key={colaborador.id} nombre={colaborador.nombre} baja={(delante + i) % 2 === 1}>
              <span className="p-avatar" aria-hidden="true">
                {colaborador.foto ? (
                  // Sin texto alternativo porque el nombre va justo debajo, y
                  // el círculo entero ya está oculto al lector de pantalla.
                  // eslint-disable-next-line @next/next/no-img-element -- un círculo de 76 px, y la dirección ya trae el prefijo (`direccionDeFotoDelEquipo`)
                  <img src={colaborador.foto} alt="" width={76} height={76} loading="lazy" decoding="async" />
                ) : (
                  iniciales(colaborador.nombre)
                )}
              </span>
              <h3>{colaborador.nombre}</h3>
              {colaborador.cargo ? <p className="p-tarjeta-cargo">{colaborador.cargo}</p> : null}
              {colaborador.descripcion ? <p className="p-tarjeta-texto">{colaborador.descripcion}</p> : null}
            </TarjetaDelEquipo>
          ))}
        </div>
      </div>
    </section>
  )
}
