import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import type { Respaldo } from '@/lib/respaldos'
import {
  directorioDeRespaldos,
  estadoDelCifrado,
  hayPgDump,
  listarRespaldos,
  problemaDelDirectorio,
} from '@/lib/respaldosServidor'
import { PanelDeRespaldos } from './PanelDeRespaldos'
import { TableroDeRespaldos } from './TableroDeRespaldos'
import './respaldos.css'

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
  const [lectura, problema, disponible, cifrado] = await Promise.all([
    listarRespaldos().then(
      (lista) => ({ lista, fallo: null as string | null }),
      (error: unknown) => ({
        lista: [] as Respaldo[],
        fallo: error instanceof Error ? error.message : String(error),
      }),
    ),
    problemaDelDirectorio(),
    hayPgDump(),
    // Se dice antes de pulsar, y no en el mensaje de después: quien respalda
    // antes de una maniobra tiene que saber si lo que va a quedar en el disco
    // es un volcado en claro (D-295).
    estadoDelCifrado(),
  ])

  const directorio = directorioDeRespaldos()

  // Las cifras y el gráfico se pintan aquí y viajan ya hechos (P-007 E5,
  // D-238): el panel es de cliente y, calculadas allí, «hoy 03:30» o «hace 2
  // días» saldrían de la hora del navegador. Reciben solo el fallo de *leer* —no
  // el de escribir—: con la carpeta legible y sin permiso de escritura los
  // respaldos que hay siguen siendo ciertos, y enseñarlos ilegibles mentiría.
  return (
    <PanelDeRespaldos
      respaldos={lectura.lista}
      directorio={directorio}
      hayHerramienta={disponible}
      cifrado={cifrado}
      problemaDelDirectorio={lectura.fallo ?? problema}
      tablero={<TableroDeRespaldos respaldos={lectura.lista} fallo={lectura.fallo} directorio={directorio} />}
    />
  )
}
