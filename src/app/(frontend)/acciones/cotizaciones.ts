'use server'

/**
 * Las acciones de la pestaña «Cotizaciones» (P-007 E3): cambiar el estado,
 * guardar las notas internas y borrar una solicitud.
 *
 * Pedir una cotización no está aquí sino en `cotizar.ts`: aquella es pública y
 * esta es del administrador, y en archivos separados la prueba de guardias
 * (`accionesConGuardia`) no puede confundirlas.
 *
 * Lo que escribió quien pide no se cambia desde ninguna (ver la cabecera de
 * `Cotizaciones.ts`): solo el estado y las notas.
 */

import { revalidatePath } from 'next/cache'
import { accion, exigirAdmin, type Respuesta } from '@/lib/guardias'
import { ErrorDeValidacion, exigirIdentificador } from '@/lib/validacion'
import { LARGOS_DE_COTIZACION, esEstadoDeCotizacion, type EstadoDeCotizacion } from '@/lib/cotizaciones'

const RUTA = '/admin-panel/cotizaciones'

/**
 * Cambia el estado, las notas o las dos cosas. Lo que no viene en `cambios` se
 * queda como estaba: el selector de estado guarda al elegir y las notas al
 * pulsar su botón, y ninguno de los dos debe pisar lo del otro.
 */
export async function actualizarCotizacion(id: unknown, cambios: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    const objetivo = exigirIdentificador(id, 'La cotización')
    const bruto = (typeof cambios === 'object' && cambios !== null ? cambios : {}) as Record<string, unknown>

    const data: { estado?: EstadoDeCotizacion; notas?: string } = {}
    if (bruto.estado !== undefined) {
      if (!esEstadoDeCotizacion(bruto.estado)) throw new ErrorDeValidacion('Ese estado no existe.')
      data.estado = bruto.estado
    }
    if (bruto.notas !== undefined) {
      if (typeof bruto.notas !== 'string') throw new ErrorDeValidacion('Las notas tienen que ser texto.')
      const notas = bruto.notas.replace(/\r\n?/g, '\n').trim()
      if ([...notas].length > LARGOS_DE_COTIZACION.notas) {
        throw new ErrorDeValidacion(`Las notas no pueden pasar de ${LARGOS_DE_COTIZACION.notas} caracteres.`)
      }
      data.notas = notas
    }
    if (Object.keys(data).length === 0) throw new ErrorDeValidacion('No hay nada que guardar.')

    await payload.update({ collection: 'cotizaciones', id: objetivo, data, user: usuario as never })
    revalidatePath(RUTA)
    return null
  })
}

/**
 * Borra una solicitud. Existe para la que no es de nadie —un robot que pasó la
 * trampa, una prueba—: una cotización de verdad que no siguió adelante se
 * cierra, no se borra, porque con ella se va lo único que queda de esa
 * conversación.
 */
export async function eliminarCotizacion(id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    await payload.delete({ collection: 'cotizaciones', id: exigirIdentificador(id, 'La cotización'), user: usuario as never })
    revalidatePath(RUTA)
    return null
  })
}
