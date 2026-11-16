'use server'

import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { accion, type Respuesta } from '@/lib/guardias'
import { COOKIE_DE_LA_INSTITUCION_DE_PRUEBA, normalizarSubdominioPedido } from '@/lib/anfitrion'
import { institucionPorSubdominio } from '@/lib/institucionesServidor'
import { PATH_DE_LAS_COOKIES } from '@/lib/pathDeLasCookies'
import { servidorDePruebas } from '@/lib/servidorDePruebas'

/**
 * El selector de institución de ved (D-371, D-396).
 *
 * ved llega por Tailscale Funnel, que no admite subdominios, así que allí la
 * institución no sale del anfitrión: la elige quien prueba, y queda en una
 * cookie que `proxy.ts` lee solo en el servidor de pruebas. Fuera de él esta
 * acción se niega, y aunque alguien escribiera la cookie a mano el proxy no la
 * miraría.
 *
 * No toca la sesión. Al cambiar de lugar, la cuenta que había deja de valer
 * —una cuenta vale solo en el suyo—, y al volver vale otra vez: para probar,
 * eso es lo cómodo. Vacío vuelve a la central.
 */
export async function elegirInstitucionDePrueba(subdominio: unknown): Promise<Respuesta> {
  return accion(async () => {
    if (!servidorDePruebas(process.env.SERVIDOR_DE_PRUEBAS)) {
      throw new Error('Elegir la institución solo se puede en el servidor de pruebas.')
    }
    const almacen = await cookies()
    const elegido = normalizarSubdominioPedido(subdominio)
    if (!elegido) {
      // Con el mismo path con que se escribió: si no, el borrado no caduca
      // nada (`pathDeLasCookies.ts`).
      almacen.delete({ name: COOKIE_DE_LA_INSTITUCION_DE_PRUEBA, path: PATH_DE_LAS_COOKIES })
      return null
    }
    const payload = await getPayload({ config })
    if (!(await institucionPorSubdominio(payload, elegido))) {
      throw new Error(`No hay ninguna institución con el subdominio «${elegido}».`)
    }
    almacen.set(COOKIE_DE_LA_INSTITUCION_DE_PRUEBA, elegido, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: PATH_DE_LAS_COOKIES,
      maxAge: 30 * 24 * 60 * 60,
    })
    return null
  })
}
