import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { clientePayload } from '../datos'
import { cotizacionDelPanel } from './datos'
import { ListaDeCotizaciones } from './ListaDeCotizaciones'
import './cotizaciones.css'

export const dynamic = 'force-dynamic'

/** Cuántas trae la lista de una vez. Una portada que recién empieza no llega ni cerca. */
const TOPE = 500

/**
 * Las solicitudes de cotización de la portada (P-007 E3).
 *
 * Solo el administrador: traen el nombre y el correo de alguien de fuera, y
 * contestarlas es asunto comercial. El menú cuenta las nuevas, como cuenta los
 * comentarios pendientes, para que una no se quede semanas sin respuesta por
 * no haber entrado aquí; el correo a los administradores
 * (`mensajeDeCotizacionNueva`) avisa además a quien no abre el panel.
 */
export default async function PaginaDeCotizaciones() {
  await exigirPanel('admin')
  const payload = await clientePayload()

  // Como en Comentarios: «todavía no ha llegado ninguna» y «no se pudo leer»
  // no son lo mismo, y una lista vacía diría lo primero cuando pasa lo segundo
  // (lo corriente, la tabla sin su migración).
  const listado = await payload
    .find({ collection: 'cotizaciones', limit: TOPE, sort: '-createdAt', depth: 0, overrideAccess: true })
    .catch((error) => {
      console.error('[panel] no se pudo leer la tabla de cotizaciones:', error)
      return null
    })

  if (!listado) {
    return (
      <div>
        <CabeceraDePagina titulo="Cotizaciones" />
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudo leer la tabla de cotizaciones.</strong> Esto no significa que no haya ninguna: la consulta
          falló. Lo corriente es que falte una tabla —un cambio de esquema desplegado sin su migración—; el detalle queda
          en el registro del servidor.
        </div>
      </div>
    )
  }

  return <ListaDeCotizaciones cotizaciones={listado.docs.map(cotizacionDelPanel)} hayMas={listado.totalDocs > TOPE} />
}
