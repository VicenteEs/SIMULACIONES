import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/sesion'
import { directorioDeRespaldos, hayPgDump, listarRespaldos } from '@/lib/respaldosServidor'
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
  const sesion = await obtenerSesion()
  if (!sesion?.usuario || sesion.rolReal !== 'admin') redirect('/')

  const [respaldos, disponible] = await Promise.all([
    listarRespaldos().catch(() => []),
    hayPgDump(),
  ])

  return (
    <PanelDeRespaldos
      respaldos={respaldos}
      directorio={directorioDeRespaldos()}
      hayHerramienta={disponible}
    />
  )
}
