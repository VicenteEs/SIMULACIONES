import { notFound } from 'next/navigation'
import { Mail } from 'lucide-react'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { NOMBRE_DE_MODULO } from '@/app/(frontend)/admin-panel/modulos'
import { etiquetaDeEstado } from '@/lib/cotizaciones'
import { TONO_DE_COTIZACION, claseDeInsignia } from '@/lib/tonosDeEstado'
import { clientePayload } from '../../datos'
import { cotizacionDelPanel, fechaDeCotizacion } from '../datos'
import { GestionDeCotizacion } from './GestionDeCotizacion'
import '../cotizaciones.css'

export const dynamic = 'force-dynamic'

/**
 * Una solicitud de cotización: lo que pidió quien escribe, a la izquierda, y
 * lo que hace el administrador con ella —estado, notas, borrar— a la derecha.
 *
 * «Responder por correo» abre el cliente de correo de quien administra, con el
 * destinatario y el asunto puestos, y no manda nada desde la plataforma: una
 * propuesta comercial se escribe con calma y se firma con nombre, y desde el
 * propio buzón queda la conversación entera en un solo sitio.
 */
export default async function PaginaDeCotizacion({ params }: { params: Promise<{ id: string }> }) {
  await exigirPanel('admin')
  const { id } = await params

  const payload = await clientePayload()
  // Un identificador que no es un número también acaba aquí: el adaptador lo
  // pasa a una columna numérica, PostgreSQL lo rechaza y la página es un 404,
  // que es lo que es.
  const fila = await payload.findByID({ collection: 'cotizaciones', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!fila) notFound()

  const c = cotizacionDelPanel(fila)
  const asunto = encodeURIComponent('TraumaHub · Tu solicitud de cotización')
  // La dirección se codifica para que un `?` o un `&` colados no añadan
  // cabeceras al correo, pero la arroba vuelve a su sitio: hay clientes que
  // no reconocen `%40` como destinatario.
  const responder = `mailto:${encodeURIComponent(c.correo).replace('%40', '@')}?subject=${asunto}`

  return (
    <div className="cot-detalle">
      <CabeceraDePagina
        titulo={c.institucion}
        subtitulo={
          <>
            Recibida el {fechaDeCotizacion(c.recibida, true)} ·{' '}
            <span className={claseDeInsignia(TONO_DE_COTIZACION[c.estado])}>{etiquetaDeEstado(c.estado)}</span>
          </>
        }
        migas={[{ etiqueta: 'Cotizaciones', href: '/admin-panel/cotizaciones' }, { etiqueta: c.institucion }]}
        acciones={
          <a className="admin-btn admin-btn-primary" href={responder}>
            <Mail size={16} aria-hidden /> Responder por correo
          </a>
        }
      />

      <div className="cot-detalle-rejilla">
        <section className="admin-card" aria-labelledby="cot-solicitud">
          <h2 id="cot-solicitud" className="admin-card-title">
            La solicitud
          </h2>
          <dl className="cot-datos">
            <div>
              <dt>Nombre</dt>
              <dd>{c.nombre}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>
                <a href={responder}>{c.correo}</a>
              </dd>
            </div>
            <div>
              <dt>Institución o servicio</dt>
              <dd>{c.institucion}</dd>
            </div>
            <div>
              <dt>Cargo</dt>
              <dd>{c.cargo || <span className="admin-celda-tenue">Sin indicar</span>}</dd>
            </div>
            <div>
              <dt>Residentes a incorporar</dt>
              <dd>{c.residentes}</dd>
            </div>
            <div>
              <dt>Módulos de interés</dt>
              <dd>
                {c.modulos.length === 0 ? (
                  <span className="admin-celda-tenue">Sin indicar</span>
                ) : (
                  <ul className="cot-chips">
                    {c.modulos.map((m) => (
                      <li key={m}>{NOMBRE_DE_MODULO[m] ?? m}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
          <h3 className="cot-subtitulo">Mensaje</h3>
          {c.mensaje ? (
            <blockquote className="cot-mensaje">{c.mensaje}</blockquote>
          ) : (
            <p className="admin-celda-tenue">No dejó mensaje.</p>
          )}
        </section>

        <GestionDeCotizacion id={c.id} estado={c.estado} notas={c.notas} institucion={c.institucion} />
      </div>
    </div>
  )
}
