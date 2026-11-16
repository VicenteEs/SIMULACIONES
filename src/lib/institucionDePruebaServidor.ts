import type { Payload } from 'payload'
import { comoValeEnElLugar } from '@/access/reglas'
import { idDeInstitucion } from '@/access/payload'
import { estaBloqueada } from '@/lib/instituciones'
import type { InstitucionDelAnfitrion } from '@/lib/institucionesServidor'
import { PATH_DE_LAS_COOKIES } from '@/lib/pathDeLasCookies'
import { registrarAccion } from '@/lib/registroServidor'

/**
 * Lo que comparten las dos formas de elegir institución en ved (D-371): el
 * selector de la franja (`acciones/institucionDePrueba.ts`) y los enlaces
 * `/lugar/<subdominio>/…` de los correos y del panel (D-405).
 *
 * Están juntas porque tienen que decir lo mismo. Una cookie escrita con otro
 * `path` no la pisa la siguiente, sino que queda al lado, y el navegador manda
 * las dos (`pathDeLasCookies.ts`). Y si solo una de las dos formas anotara la
 * entrada del soporte, el registro de TraumaHub contaría unas sí y otras no.
 */

/** Cómo se escribe la cookie del selector. Treinta días: quien prueba no tiene que volver a elegir cada mañana. */
export const opcionesDeLaCookieDePrueba = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: PATH_DE_LAS_COOKIES,
  maxAge: 30 * 24 * 60 * 60,
})

/**
 * Si quien elige la institución es el administrador de TraumaHub, anota que
 * entró como su soporte (D-404).
 *
 * En Contabo la entrada la anota `entrar`, porque allí hay que entrar en el
 * subdominio. En ved basta con elegir el lugar, con la sesión de siempre, así
 * que se anota al elegirlo. La cuenta se lee tal cual, sin mirar el lugar: la
 * petición todavía llega desde el anterior.
 */
export async function anotarLaEntradaDelSoporteEnPruebas(
  payload: Payload,
  institucion: Pick<InstitucionDelAnfitrion, 'id' | 'nombre' | 'subdominio' | 'vence'>,
  cabeceras: Headers,
): Promise<void> {
  const { user } = await payload.auth({ headers: cabeceras })
  const cuenta = user as { rol?: unknown; activo?: unknown; institucion?: unknown } | null
  if (
    cuenta?.activo !== true ||
    estaBloqueada(institucion.vence) ||
    comoValeEnElLugar(cuenta.rol, idDeInstitucion(cuenta.institucion), institucion.id) !== 'soporte'
  ) {
    return
  }
  const soporteEn = `${institucion.nombre} (${institucion.subdominio})`
  await registrarAccion(payload, { accion: 'entrada-como-soporte', usuario: cuenta, titulo: soporteEn, soporteEn })
}
