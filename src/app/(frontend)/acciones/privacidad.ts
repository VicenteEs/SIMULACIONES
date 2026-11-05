'use server'

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { accion, type Respuesta } from '@/lib/guardias'
import { AVISO_CAMBIADO, VERSION_DEL_AVISO_DE_PRIVACIDAD } from '@/lib/avisoDePrivacidad'
import { registrarAccion } from '@/lib/registroServidor'

/**
 * La cuenta acepta la versión vigente del aviso de privacidad (D-292).
 *
 * La llama el botón de la pantalla que la plantilla pone en lugar de cualquier
 * página mientras la cuenta no haya aceptado esta versión
 * (`PantallaDelAviso`). Es lo que cubre a quien no pasó por `/registro`: el
 * equipo, las cuentas que un administrador crea desde el panel para una
 * institución y, el día que el texto cambie, todas las demás.
 *
 * Tres cosas, como `solicitarCuenta`, que es la otra puerta por la que se
 * acepta:
 *
 *  - **Se anota sobre la cuenta de la sesión, y solo sobre ella.** No recibe
 *    ningún identificador: aceptar por otro sería fabricar su consentimiento.
 *    Y es la cuenta real, no la que simula un administrador que mira la
 *    plataforma «como residente».
 *  - **El navegador manda la versión que enseñó**, no un «sí». Si el aviso
 *    cambió mientras la pantalla estaba abierta, se rechaza y se pide volver a
 *    leerlo: la cuenta no puede quedar anotada con un texto que no vio.
 *  - **Las dos columnas se escriben con `overrideAccess`**: por la API están
 *    cerradas a todos, administrador incluido (`Usuarios.ts`), porque una
 *    aceptación que se puede reescribir no prueba nada.
 *
 * La línea del registro dice cuándo se aceptó cada versión; la cuenta solo
 * guarda la última.
 */
export async function aceptarElAvisoDePrivacidad(version: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { usuario, activo } = await obtenerSesion()
    if (!usuario || !activo) throw new Error('Tu sesión terminó. Vuelve a entrar.')
    if (version !== VERSION_DEL_AVISO_DE_PRIVACIDAD) throw new Error(AVISO_CAMBIADO)

    const payload = await getPayload({ config })
    const id = usuario.id as number | string
    await payload.update({
      collection: 'usuarios',
      id,
      data: { privacidadAceptadaEn: new Date().toISOString(), versionDelAvisoDePrivacidad: version },
      overrideAccess: true,
    })
    await registrarAccion(payload, {
      accion: 'aviso-aceptado',
      usuario,
      coleccion: 'usuarios',
      documentoId: id,
      detalle: `versión ${version}`,
    })
    // La plantilla es la que decide si enseña el aviso o la página, y en una
    // navegación del cliente no se vuelve a pintar sola.
    revalidatePath('/', 'layout')
    return null
  })
}
