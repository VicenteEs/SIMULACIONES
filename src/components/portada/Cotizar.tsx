import { ArrowDown, CircleCheck, Mail } from 'lucide-react'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { FormularioDeCotizacion } from './FormularioDeCotizacion'
import { Hilo } from './Hilo'
import { Resaltado } from './Resaltado'

/**
 * «Cotizar», al final de todo (D-231): lo que se ofrece a la izquierda y el
 * formulario a la derecha, donde termina el hilo.
 *
 * Lo que se envía queda en la pestaña «Cotizaciones» del panel y avisa por
 * correo a los administradores (`pedirCotizacion`). El correo de contacto va
 * también aquí, a la vista: hay quien prefiere escribir a rellenar un
 * formulario, y obligarlo a lo segundo es perderlo.
 */
export function Cotizar({ pagina, modulosVisibles }: { pagina: PaginaLeida; modulosVisibles: readonly string[] }) {
  const t = (clave: string) => pagina.texto(`portada.cotizar.${clave}`)
  const correo = pagina.texto('general.correo')
  const garantias = [1, 2, 3].map((n) => t(`garantia-${n}`)).filter(Boolean)

  return (
    <section id="cotizar" className="p-cotizar p-oscuro" aria-labelledby="p-cotizar-titular">
      <Hilo forma="izquierda" />
      <div className="p-contenedor p-dos-columnas p-cotizar-rejilla">
        <div>
          <p className="p-antetitulo">{t('antetitulo')}</p>
          <h2 id="p-cotizar-titular" className="p-titular p-titular-grande">
            <Resaltado texto={t('titular')} />
          </h2>
          <p className="p-bajada">{t('bajada')}</p>
          {garantias.length > 0 ? (
            <ul className="p-garantias">
              {garantias.map((g) => (
                <li key={g}>
                  <CircleCheck size={20} aria-hidden /> {g}
                </li>
              ))}
            </ul>
          ) : null}
          <a className="p-correo" href={`mailto:${correo}`}>
            <Mail size={16} aria-hidden /> {correo}
          </a>
        </div>
        <div className="p-cotizar-formulario">
          <span className="p-nodo p-nodo-cian" aria-hidden="true">
            <ArrowDown size={18} />
          </span>
          <FormularioDeCotizacion
            modulosVisibles={modulosVisibles}
            textos={{
              titulo: t('formulario.titulo'),
              boton: t('formulario.boton'),
              nota: t('formulario.nota'),
              enviadaTitular: t('enviada.titular'),
              enviadaBajada: t('enviada.bajada'),
            }}
          />
        </div>
      </div>
    </section>
  )
}
