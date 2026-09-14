'use server'

/**
 * El correo de prueba del panel de Sistema.
 *
 * La comprobación «Correo saliente» saluda al servidor, y un saludo solo
 * demuestra que al otro lado hay un SMTP vivo. Los fallos que de verdad dejan a
 * un residente sin su enlace de contraseña vienen después del saludo: una clave
 * mal copiada, un remitente que cPanel no deja usar con esa cuenta, un
 * certificado a nombre de otro servidor. Eso solo lo descubre un envío de
 * verdad, y hasta ahora el primero lo hacía el residente.
 */

import { accion, exigirAdmin, type Respuesta } from '@/lib/guardias'
import {
  enviarCorreo,
  explicarFalloDeCorreo,
  hayCorreo,
  puertoDeCorreo,
  SinServidorDeCorreo,
} from '@/correo/enviar'
import { mensajeDePrueba } from '@/correo/mensajes'
import { crearLimitador } from '@/lib/ritmo'

/**
 * Cada prueba gasta un correo de la cuota por hora del hosting, la misma de la
 * que salen los enlaces de contraseña. Un botón pulsado en bucle mientras se
 * prueba una configuración puede dejarla a cero, y ese día a quien olvidó su
 * clave no le llega nada. Cinco en diez minutos sobran: cambiar el `.env` exige
 * reiniciar el servicio, así que entre intento e intento siempre pasa un rato.
 */
const limitador = crearLimitador('correo-de-prueba', { maximo: 5, ventanaMs: 10 * 60_000 })

export async function enviarCorreoDePrueba(): Promise<Respuesta<{ para: string }>> {
  return accion(async () => {
    const { payload, usuarioId } = await exigirAdmin()

    // Siempre a la cuenta de quien lo pide, nunca a una dirección que llegue
    // como argumento: una acción que manda a donde se le diga es un repetidor
    // de correo con la cuenta y la plantilla de la plataforma, a un clic de la
    // suplantación.
    //
    // Se lee de la base antes de mirar si hay servidor, a propósito: así la
    // acción toca Payload en cuanto pasa la guardia también en una instalación
    // sin SMTP. `tests/unit/accionesConGuardia.test.ts` distingue «rechazada
    // por la guardia» de «pasó» por lo que llega a tocar, y un `throw` antes de
    // tocar nada se leería como un portazo al administrador.
    const cuenta = await payload.findByID({ collection: 'usuarios', id: usuarioId, depth: 0 })
    const para = typeof cuenta?.email === 'string' ? cuenta.email : ''
    if (!para) throw new Error('Su cuenta no tiene correo al que enviar la prueba.')

    if (!hayCorreo()) throw new SinServidorDeCorreo()
    if (!limitador.permitir(usuarioId)) {
      throw new Error('Ya envió varias pruebas en los últimos minutos. Espere un poco antes de volver a intentarlo.')
    }

    const nombre = typeof cuenta.nombre === 'string' ? cuenta.nombre.trim() : ''
    try {
      await enviarCorreo(payload, {
        para,
        correo: mensajeDePrueba({
          quien: nombre ? `${nombre} (${para})` : para,
          servidor: `${process.env.SMTP_HOST}:${puertoDeCorreo()}`,
        }),
      })
    } catch (error) {
      // Al panel va la explicación; al registro, el error tal cual, con su
      // código y la respuesta del servidor, que es lo que hace falta si la
      // explicación no basta.
      payload.logger.error({ msg: 'Falló el correo de prueba del panel de Sistema', err: error })
      throw new Error(explicarFalloDeCorreo(error))
    }
    return { para }
  })
}
