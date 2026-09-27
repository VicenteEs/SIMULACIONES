import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import type { Respaldo } from '@/lib/respaldos'
import {
  directorioDeRespaldos,
  hayPgDump,
  listarRespaldos,
  problemaDelDirectorio,
} from '@/lib/respaldosServidor'
import { PanelDeRespaldos } from './PanelDeRespaldos'

export const dynamic = 'force-dynamic'

/**
 * Respaldos de la base de datos.
 *
 * El servidor hace uno diario por su cuenta, pero esta página existe para los
 * dos momentos en que eso no basta: antes de una maniobra arriesgada, cuando se
 * quiere un respaldo *ahora*, y el día que hay que llevarse una copia fuera del
 * servidor. Un respaldo que solo vive en la misma máquina que la base no
 * protege del incendio, únicamente del error.
 */
export default async function PaginaRespaldos() {
  await exigirPanel('admin')

  // El fallo de lectura se enseña, no se convierte en una tabla vacía: una
  // carpeta sin permisos se veía como «0 volcados», que invita a pensar que
  // los respaldos se perdieron (O-067). `problemaDelDirectorio` cubre además el
  // caso en que se puede listar pero no escribir, que es el que hace fallar el
  // botón.
  const [lectura, problema, disponible] = await Promise.all([
    listarRespaldos().then(
      (lista) => ({ lista, fallo: null as string | null }),
      (error: unknown) => ({
        lista: [] as Respaldo[],
        fallo: error instanceof Error ? error.message : String(error),
      }),
    ),
    problemaDelDirectorio(),
    hayPgDump(),
  ])

  return (
    <PanelDeRespaldos
      respaldos={lectura.lista}
      directorio={directorioDeRespaldos()}
      hayHerramienta={disponible}
      problemaDelDirectorio={lectura.fallo ?? problema}
    />
  )
}
