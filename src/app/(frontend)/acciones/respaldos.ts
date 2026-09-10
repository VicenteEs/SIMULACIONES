'use server'

/**
 * Respaldos desde el panel.
 *
 * Existe cron para el respaldo diario, pero antes de una maniobra arriesgada
 * —importar contenido, cambiar el esquema, actualizar la plataforma— hace falta
 * poder respaldar ahora, sin abrir una sesión SSH. Estas acciones producen
 * exactamente los mismos archivos que `scripts/respaldar.sh`.
 */

import { revalidatePath } from 'next/cache'
import { exigirAdmin, accion, type Respuesta } from '@/lib/guardias'
import { esNombreDeRespaldo, type Respaldo } from '@/lib/respaldos'
import { crearRespaldo, eliminarRespaldo, listarRespaldos } from '@/lib/respaldosServidor'

const RUTA = '/admin-panel/respaldos'

export async function respaldarAhora(): Promise<Respuesta<Respaldo>> {
  return accion(async () => {
    await exigirAdmin()
    const respaldo = await crearRespaldo()
    revalidatePath(RUTA)
    return respaldo
  })
}

export async function borrarRespaldo(nombre: unknown): Promise<Respuesta> {
  return accion(async () => {
    await exigirAdmin()
    if (!esNombreDeRespaldo(nombre)) throw new Error('Nombre de respaldo no válido.')
    await eliminarRespaldo(nombre)
    revalidatePath(RUTA)
    return null
  })
}
