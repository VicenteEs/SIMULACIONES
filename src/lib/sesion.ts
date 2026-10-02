import { cache } from 'react'
import { headers as siguientesCabeceras, cookies as siguientesCookies } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { COOKIE_VISTA_PREVIA, rolEfectivo } from '@/lib/vistaPrevia'
import type { Rol } from '@/access/reglas'

export interface Sesion {
  usuario: Record<string, unknown> | null
  activo: boolean
  rolReal: Rol | null
  rol: Rol | null
  simulando: boolean
}

/**
 * Sesión resuelta, con la vista previa de rol ya aplicada.
 *
 * Devuelve además un usuario con el rol efectivo, listo para pasárselo a las
 * consultas: así, cuando un editor mira «como residente», la propia base filtra
 * los borradores en lugar de que la página los oculte por su cuenta. Eso es lo
 * que hace fiable la vista previa: enseña exactamente lo que el residente
 * recibiría, no una imitación.
 *
 * Con `cache` de React, una vez por petición. La llaman la plantilla, la página,
 * la guardia del panel y la barra en el mismo pintado, y cada llamada era un
 * `payload.auth`: verificar el testigo y leer la cuenta de la base, tres o
 * cuatro veces para contestar lo mismo. `cache` solo dura lo que dura la
 * petición, así que una baja o un cambio de rol se ven en la siguiente, igual
 * que antes. Fuera de un pintado de servidor —las pruebas— no guarda nada y
 * cada llamada vuelve a preguntar.
 */
export const obtenerSesion = cache(async function obtenerSesion(): Promise<
  Sesion & { usuarioEfectivo: unknown }
> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await siguientesCabeceras() })

  if (!user) {
    return { usuario: null, activo: false, rolReal: null, rol: null, simulando: false, usuarioEfectivo: null }
  }

  const registro = user as unknown as Record<string, unknown>
  const activo = registro.activo === true
  const rolReal = (registro.rol as Rol) ?? 'lector'

  const galleta = (await siguientesCookies()).get(COOKIE_VISTA_PREVIA)?.value
  const rol = rolEfectivo(rolReal, galleta)

  return {
    usuario: registro,
    activo,
    rolReal,
    rol,
    simulando: rol !== rolReal,
    usuarioEfectivo: { ...registro, rol },
  }
})
