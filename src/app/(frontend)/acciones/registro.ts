'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { esFantasma } from '@/access/payload'
import { registrarLatido } from '@/lib/registroServidor'
import { sinPrefijo } from '@/lib/rutas'

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
 *
 * Tampoco para el soporte de TraumaHub dentro de una institución (D-404): su
 * tiempo saldría en las estadísticas de la institución, y el fantasma entra sin
 * aparecer en ellas. La plantilla ya no le monta el latido; esto es por si lo
 * manda una pestaña abierta antes.
 */
export async function registrarLatidoDeActividad(rutaActual: unknown): Promise<void> {
  try {
    const { activo, usuario } = await obtenerSesion()
    const id = (usuario as { id?: unknown } | null)?.id
    if (!activo || id === undefined || id === null || esFantasma(usuario)) return
    // Solo la ruta, sin datos de la consulta: pueden llevar un correo o una
    // búsqueda, y al registro solo le interesa en qué pantalla estaba.
    //
    // Y sin el prefijo de la instalación (D-370). El latido manda
    // `window.location.pathname`, que lo trae, y la base no debe guardarlo:
    // copiada de ved a Contabo, la «Última página» diría `/traumahub/…` en una
    // plataforma que va en la raíz. Se quita aquí y no en el navegador porque
    // así también se corrige lo que manden las pestañas abiertas con el código
    // de antes.
    const ruta =
      typeof rutaActual === 'string' ? sinPrefijo(rutaActual.split('?')[0].split('#')[0]) : ''
    const payload = await getPayload({ config })
    await registrarLatido(payload, id as string | number, ruta || '/')
  } catch (error) {
    console.error('[registro] no se pudo abonar el latido de actividad:', error)
  }
}
