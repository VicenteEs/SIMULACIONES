'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { registrarLatido } from '@/lib/registroServidor'

/**
 * El latido de actividad: «sigo aquí, y tocando la plataforma» (D-145).
 *
 * Lo manda `LatidoDeActividad` cada minuto mientras la pestaña está a la vista y
 * alguien la ha tocado en el último minuto y medio. Se cuenta a la cuenta
 * **real**, no a la que el administrador esté «viendo como»: quien mira la
 * plataforma como residente sigue siendo él quien trabaja.
 *
 * No propaga nada, por lo mismo que `registrarVisita`: medir el tiempo es una
 * comodidad del panel y su fallo no puede estropear la lectura de una ficha.
 * Sin sesión activa no hace nada.
 */
export async function registrarLatidoDeActividad(rutaActual: unknown): Promise<void> {
  try {
    const { activo, usuario } = await obtenerSesion()
    const id = (usuario as { id?: unknown } | null)?.id
    if (!activo || id === undefined || id === null) return
    // Solo la ruta, sin datos de la consulta: pueden llevar un correo o una
    // búsqueda, y al registro solo le interesa en qué pantalla estaba.
    const ruta = typeof rutaActual === 'string' ? rutaActual.split('?')[0].split('#')[0] : ''
    const payload = await getPayload({ config })
    await registrarLatido(payload, id as string | number, ruta || '/')
  } catch (error) {
    console.error('[registro] no se pudo abonar el latido de actividad:', error)
  }
}
