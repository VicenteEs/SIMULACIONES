'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { accion, type Respuesta } from '@/lib/guardias'
import { usuarioDeSesion } from '@/access/payload'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { RECORRIDOS, esClaveDeRecorrido, recorridosDisponibles } from '@/lib/bienvenida'

/**
 * Cierra la bienvenida del primer ingreso y dice a dónde ir (P-007 E4, D-237).
 *
 * `recorrido` es la clave de uno de los cuatro, o `null` para «Saltar por
 * ahora», que lleva a la portada. Las dos salidas cierran la bienvenida: quien
 * la salta ya decidió no verla, y volver a ponérsela delante en cada entrada la
 * convierte en un peaje.
 *
 * Se anota sobre la cuenta real y no sobre la efectiva: un administrador que
 * mira la plataforma como residente y pulsa aquí está cerrando su propia
 * bienvenida, que no se le enseña nunca, y no la de ningún residente.
 */
export async function cerrarLaBienvenida(recorrido: unknown): Promise<Respuesta<{ destino: string }>> {
  return accion(async () => {
    const { usuario, usuarioEfectivo, activo } = await obtenerSesion()
    if (!usuario || !activo) throw new Error('Su sesión terminó. Vuelva a entrar.')
    if (recorrido !== null && !esClaveDeRecorrido(recorrido)) {
      throw new Error('Ese recorrido no es uno de los cuatro.')
    }

    // Con la misma lista que pinta la página: un recorrido hacia un módulo que
    // la cuenta no ve se rechaza aquí con su frase, y no tres pantallas después
    // con la de «no tiene acceso a este módulo».
    let destino = '/'
    if (recorrido !== null) {
      const disponibles = recorridosDisponibles(usuarioDeSesion(usuarioEfectivo), await modulosEnMantencion())
      const elegido = disponibles.find((r) => r.clave === recorrido)
      if (!elegido) {
        const nombre = RECORRIDOS.find((r) => r.clave === recorrido)?.titulo ?? ''
        throw new Error(`«${nombre}» lleva a un módulo que su cuenta no tiene abierto. Elija otro.`)
      }
      destino = elegido.ruta
    }

    // Solo la primera vez: la fecha dice cuándo se vio por primera vez, y la
    // página se puede volver a abrir a mano sin moverla.
    if (!(usuario as { bienvenidaVistaEn?: unknown }).bienvenidaVistaEn) {
      const payload = await getPayload({ config })
      await payload.update({
        collection: 'usuarios',
        id: (usuario as { id: number | string }).id,
        data: { bienvenidaVistaEn: new Date().toISOString() },
        // El campo se cierra a toda escritura por la API (`Usuarios.ts`); esta
        // acción es la única que lo escribe, y por eso salta el acceso.
        overrideAccess: true,
      })
    }
    return { destino }
  })
}
