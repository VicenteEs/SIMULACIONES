import type React from 'react'
import { ArrowRight, CalendarDays, Check, ShieldCheck, X } from 'lucide-react'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { Ancla } from './Ancla'
import { BarraDeVisitante } from './BarraDeVisitante'
import { PieDeVisitante } from './PieDeVisitante'
import { GRUPOS_DE_LA_COMPARATIVA, INCLUYE, PLANES, PLAN_DESTACADO, type ClaveDePlan } from './planes'
import { PreguntasFrecuentes } from './PreguntasFrecuentes'
import { Resaltado } from './Resaltado'
import './portada.css'
import './planes.css'

/**
 * `/planes` (P-007 E3): el tablero «Planes» de Penpot (D-232). Tres planes sin
 * precio, el piloto, la comparativa, las preguntas y el cierre.
 *
 * No tiene formulario propio: todos sus botones llevan a «Cotizar» de la
 * portada. Dos formularios iguales en dos páginas son dos sitios donde
 * arreglar lo mismo, y el de la portada ya tiene su trampa, sus límites y su
 * pantalla de enviada.
 *
 * Como `PortadaPublica`, no lee nada por su cuenta, y la recibe también
 * `/vista-previa`. Va dentro de `<main class="portada">` para que la hoja le
 * esconda la barra y el pie de la plataforma igual que a la portada.
 */
export function PaginaDePlanes({ pagina, vistaPrevia }: { pagina: PaginaLeida; vistaPrevia?: React.ReactNode }) {
  return (
    <main className="portada portada-planes">
      {vistaPrevia}
      <BarraDeVisitante pagina="planes" textoCotizar={pagina.texto('portada.cotizar.antetitulo') || 'Cotizar'} />
      <CabeceraYPlanes pagina={pagina} />
      <Piloto pagina={pagina} />
      <Comparativa pagina={pagina} />
      <div className="pl-preguntas">
        <PreguntasFrecuentes pagina={pagina} prefijo="planes.preguntas" conHilo={false} />
      </div>
      <Cierre pagina={pagina} />
      <PieDeVisitante pagina={pagina} enLaPortada={false} />
    </main>
  )
}

function CabeceraYPlanes({ pagina }: { pagina: PaginaLeida }) {
  const t = (clave: string) => pagina.texto(`planes.hero.${clave}`)
  return (
    <>
      <section className="pl-cabecera p-oscuro" aria-labelledby="pl-titular">
        <div className="p-contenedor pl-cabecera-texto">
          <p className="p-antetitulo">{t('antetitulo')}</p>
          <h1 id="pl-titular" className="p-titular p-titular-medio">
            <Resaltado texto={t('titular')} />
          </h1>
          <p className="p-bajada">{t('bajada')}</p>
        </div>
      </section>
      <div className="p-contenedor pl-planes">
        {PLANES.map((clave) => (
          <TarjetaDePlan key={clave} clave={clave} pagina={pagina} />
        ))}
      </div>
    </>
  )
}

/**
 * Una tarjeta de plan. El destacado lo decide el código (`PLAN_DESTACADO`),
 * pero solo se pinta destacado mientras tenga sello: si el administrador lo
 * vacía, el plan vuelve a ser uno más, que es lo que promete la ayuda del
 * campo.
 */
function TarjetaDePlan({ clave, pagina }: { clave: ClaveDePlan; pagina: PaginaLeida }) {
  const t = (campo: string) => pagina.texto(`planes.${clave}.${campo}`)
  const sello = clave === PLAN_DESTACADO ? t('sello') : ''
  const incluye = [1, 2, 3, 4, 5].map((n) => t(`incluye-${n}`)).filter(Boolean)
  const id = `pl-plan-${clave}`

  return (
    <article className={`pl-plan${sello ? ' pl-plan-destacado' : ''}`} aria-labelledby={id}>
      {sello ? <p className="pl-sello">{sello}</p> : null}
      <h2 id={id} className="pl-plan-nombre">
        {t('nombre')}
      </h2>
      <p className="pl-plan-para">{t('para')}</p>
      <p className="pl-precio">
        <strong>{t('precio')}</strong>
        {t('nota-del-precio') ? <span>{t('nota-del-precio')}</span> : null}
      </p>
      {incluye.length > 0 ? (
        <ul className="pl-incluye">
          {incluye.map((linea) => (
            <li key={linea}>
              <Check size={17} aria-hidden /> {linea}
            </li>
          ))}
        </ul>
      ) : null}
      <Ancla
        id="cotizar"
        enLaPortada={false}
        className={`p-boton p-boton-bloque ${sello ? 'p-boton-cian' : 'p-boton-contorno-claro'}`}
        aria-describedby={id}
      >
        {t('boton')} <ArrowRight size={17} aria-hidden />
      </Ancla>
    </article>
  )
}

/** La banda del piloto. Con el titular vacío no se pinta, como dice su ayuda. */
function Piloto({ pagina }: { pagina: PaginaLeida }) {
  const t = (clave: string) => pagina.texto(`planes.piloto.${clave}`)
  if (!t('titular')) return null
  return (
    <section className="p-contenedor pl-piloto" aria-labelledby="pl-piloto-titular">
      <span className="pl-piloto-icono" aria-hidden="true">
        <ShieldCheck size={22} />
      </span>
      <div className="pl-piloto-texto">
        <h2 id="pl-piloto-titular">{t('titular')}</h2>
        {t('texto') ? <p>{t('texto')}</p> : null}
      </div>
      {t('boton') ? (
        <Ancla id="cotizar" enLaPortada={false} className="p-boton p-boton-marca p-boton-sm">
          {t('boton')} <ArrowRight size={16} aria-hidden />
        </Ancla>
      ) : null}
    </section>
  )
}

/**
 * La comparativa, como `<table>` de verdad: un lector de pantalla anuncia la
 * columna del plan al pasar por cada celda, y eso con una rejilla de `div`
 * habría que reconstruirlo a mano. El visto y la cruz son dibujos; lo que se
 * lee es «Incluido» o «No incluido».
 */
function Comparativa({ pagina }: { pagina: PaginaLeida }) {
  const t = (clave: string) => pagina.texto(`planes.comparativa.${clave}`)
  return (
    <section className="p-contenedor pl-comparativa" aria-labelledby="pl-comparativa-titular">
      <h2 id="pl-comparativa-titular" className="p-titular pl-titular-chico">
        {t('titular')}
      </h2>
      {/* El contenedor desplaza la tabla en el teléfono sin desplazar la página. */}
      <div className="pl-tabla-marco" tabIndex={0} role="region" aria-labelledby="pl-comparativa-titular">
        <table className="pl-tabla">
          <thead>
            <tr>
              <td />
              {PLANES.map((plan) => (
                <th key={plan} scope="col">
                  {pagina.texto(`planes.${plan}.nombre`)}
                </th>
              ))}
            </tr>
          </thead>
          {GRUPOS_DE_LA_COMPARATIVA.map(({ grupo, filas }) => (
            <tbody key={grupo}>
              <tr className="pl-tabla-grupo">
                <th scope="colgroup" colSpan={PLANES.length + 1}>
                  {t(`grupo-${grupo}`)}
                </th>
              </tr>
              {filas.map((fila) => (
                <tr key={fila}>
                  <th scope="row">{t(`fila.${fila}`)}</th>
                  {PLANES.map((plan) => (
                    <td key={plan}>
                      {INCLUYE[fila][plan] ? (
                        <Check className="pl-si" size={18} aria-label="Incluido" role="img" />
                      ) : (
                        <X className="pl-no" size={18} aria-label="No incluido" role="img" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  )
}

/**
 * El cierre. El botón secundario escribe al correo de contacto: no hay
 * agenda en la plataforma, y prometer una con un botón que lleva a un
 * formulario sería engañar al que pulsa.
 */
function Cierre({ pagina }: { pagina: PaginaLeida }) {
  const t = (clave: string) => pagina.texto(`planes.cierre.${clave}`)
  const correo = pagina.texto('general.correo')
  return (
    <section className="pl-cierre" aria-labelledby="pl-cierre-titular">
      <div className="p-contenedor pl-cierre-interior">
        <h2 id="pl-cierre-titular" className="p-titular p-titular-medio">
          <Resaltado texto={t('titular')} />
        </h2>
        {t('bajada') ? <p className="p-bajada">{t('bajada')}</p> : null}
        <div className="pl-cierre-acciones">
          <Ancla id="cotizar" enLaPortada={false} className="p-boton p-boton-cian p-boton-lg">
            {t('boton-principal')} <ArrowRight size={18} aria-hidden />
          </Ancla>
          {t('boton-secundario') && correo ? (
            <a className="p-boton p-boton-contorno p-boton-lg" href={`mailto:${correo}`}>
              <CalendarDays size={18} aria-hidden /> {t('boton-secundario')}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  )
}
