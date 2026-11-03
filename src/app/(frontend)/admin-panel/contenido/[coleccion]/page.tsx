import { notFound } from 'next/navigation'
import { exigirPanelPara } from '@/app/(frontend)/admin-panel/acceso'
import { esColeccionEditable, esquemaDe } from '@/admin/esquema'
import { TablaDocumentos } from '@/components/admin/TablaDocumentos'
import { clientePayload } from '../../datos'
import { MODULOS } from '../../modulos'
import { conteoDelModulo, cuentasDeLasVistas, lecturasPorFicha } from '../tablero'
import { TableroDeEquipo } from './TableroDeEquipo'
import '../contenido.css'

export const dynamic = 'force-dynamic'

/**
 * Listado de una colección.
 *
 * La página resuelve el esquema y comprueba el acceso; las filas las pide la
 * tabla, porque el filtro y la paginación cambian sin recargar la página.
 *
 * Lo que la tabla no puede pedir sola lo trae la página (P-007 E5, D-238): en
 * los cinco módulos, cuántas fichas hay en cada estado —las cuentas de las
 * pestañas— y, para el administrador, cuántas veces se abrió cada una en los
 * últimos treinta días. En «Equipo», el tablero de quién revisa qué, que no es
 * de esta colección sino de las cuentas y la cola: la barra lateral lleva a
 * «Equipo» aquí, y es la pantalla donde se pregunta por las personas.
 */
export default async function PaginaDeColeccion({
  params,
}: {
  params: Promise<{ coleccion: string }>
}) {
  // El acceso se comprueba antes que la validez del slug: un 404 y una
  // redirección distinguibles le dirían a un curioso sin sesión qué colecciones
  // existen.
  const { coleccion } = await params
  const { esAdmin } = await exigirPanelPara(coleccion)
  if (!esColeccionEditable(coleccion)) notFound()
  const esquema = esquemaDe(coleccion)

  // `equipo` es solo del administrador (`soloAdmin`), y `exigirPanelPara` ya
  // echó a cualquier otra cuenta: el tablero no vuelve a preguntar.
  if (coleccion === 'equipo') {
    return (
      <TablaDocumentos
        esquema={esquema}
        esAdmin={esAdmin}
        subtitulo="Quién revisa qué, cuánta revisión tiene encima cada uno y quiénes aparecen en la página pública"
      >
        <TableroDeEquipo />
      </TablaDocumentos>
    )
  }

  const modulo = MODULOS.find((m) => m.slug === coleccion)
  if (!modulo) return <TablaDocumentos esquema={esquema} esAdmin={esAdmin} />

  const payload = await clientePayload()
  const [conteo, cuentas, lecturas] = await Promise.all([
    conteoDelModulo(payload, coleccion),
    cuentasDeLasVistas(payload, esquema),
    esAdmin ? lecturasPorFicha(payload, coleccion) : undefined,
  ])
  return (
    <TablaDocumentos
      esquema={esquema}
      esAdmin={esAdmin}
      modulo={{
        nombre: modulo.nombre,
        numero: modulo.numero,
        publico: modulo.ruta,
        total: conteo?.total ?? null,
        publicadas: conteo?.publicadas ?? null,
      }}
      cuentas={cuentas}
      {...(lecturas !== undefined ? { lecturas } : {})}
    />
  )
}
