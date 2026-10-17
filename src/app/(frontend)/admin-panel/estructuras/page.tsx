import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { leerCatalogo } from '@/lib/catalogoDelAtlas'
import { leerTodasLasEstructuras } from '@/lib/estructurasServidor'
import { armarListado } from '@/lib/listadoDeEstructuras'
import { clientePayload } from '../datos'
import { PantallaDeEstructuras } from './PantallaDeEstructuras'
import './estructuras.css'

export const dynamic = 'force-dynamic'

/**
 * El listado global de estructuras anatómicas (D-179, P-003 E8).
 *
 * Entran el editor y el administrador, como el resto de «Trabajo»: el
 * traumatólogo que llena las fichas es el editor, y no tiene por qué ser
 * administrador. Cargar las piezas del atlas y todo lo que toca miles de filas es
 * del administrador, y lo comprueba la acción, no este archivo.
 *
 * La página arma el listado entero en el servidor —las 2.231 piezas con su
 * estado— y manda al navegador solo nombres, estados y qué falta. El texto de las
 * fichas no viaja aquí: la ventana de edición lo pide al abrirse una pieza.
 */
export default async function PaginaDeEstructuras() {
  const { esAdmin } = await exigirPanel()
  const payload = await clientePayload()

  // Sin este `catch`, una tabla que falta —un cambio de esquema desplegado sin su
  // migración— tumba la página con la pantalla genérica de Next, que no nombra la
  // tabla. Lo que no se hace es seguir con una lista vacía: «todavía no hay
  // fichas» y «no se pudieron leer» no son lo mismo.
  const catalogo = await leerCatalogo().catch((error) => {
    console.error('[panel] no se pudo leer el catálogo del atlas:', error)
    return null
  })
  const filas = await leerTodasLasEstructuras(payload).catch((error) => {
    console.error('[panel] no se pudo leer la tabla de estructuras anatómicas:', error)
    return null
  })

  if (!catalogo) {
    return (
      <div>
        <CabeceraDePagina titulo="Estructuras anatómicas" />
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>El atlas anatómico no está instalado en este servidor.</strong> Falta{' '}
          <code>public/atlas/catalogo.json</code>: sin el catálogo no hay piezas que listar.
        </div>
      </div>
    )
  }
  if (!filas) {
    return (
      <div>
        <CabeceraDePagina titulo="Estructuras anatómicas" />
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudo leer la tabla de estructuras anatómicas.</strong> Esto no significa que esté vacía: la
          consulta falló. Lo corriente es que falte la tabla —un cambio de esquema desplegado sin su migración—; el
          detalle queda en el registro del servidor.
        </div>
      </div>
    )
  }

  return <PantallaDeEstructuras listado={armarListado(catalogo, filas)} puedeCargar={esAdmin} />
}
