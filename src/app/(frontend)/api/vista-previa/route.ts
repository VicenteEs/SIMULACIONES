import { NextResponse } from 'next/server'
import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { COOKIE_VISTA_PREVIA, puedeSimularRol } from '@/lib/vistaPrevia'
import type { Rol } from '@/access/reglas'

/**
 * Activa o desactiva la vista previa de rol.
 *
 * La comprobación se hace aquí, en el servidor, y no en el componente: la
 * cookie la puede escribir cualquiera desde el navegador, de modo que confiar
 * en ella sin validar convertiría un conmutador de comodidad en una escalada de
 * privilegios.
 */
export async function POST(peticion: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await siguientesCabeceras() })

  if (!user || !(user as { activo?: boolean }).activo) {
    return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 })
  }

  const { rol } = (await peticion.json().catch(() => ({}))) as { rol?: unknown }
  const real = (user as { rol?: Rol }).rol ?? 'lector'

  const respuesta = NextResponse.json({ ok: true, rol: rol ?? null })

  if (rol === null || rol === undefined || rol === real) {
    respuesta.cookies.delete(COOKIE_VISTA_PREVIA)
    return respuesta
  }

  if (!puedeSimularRol(real, rol)) {
    return NextResponse.json(
      { error: 'No se puede simular un rol con más privilegios que el propio.' },
      { status: 403 },
    )
  }

  respuesta.cookies.set(COOKIE_VISTA_PREVIA, rol as string, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 4,
  })
  return respuesta
}
