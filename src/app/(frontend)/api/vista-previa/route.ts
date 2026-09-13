import { NextResponse } from 'next/server'
import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { PATH_DE_LAS_COOKIES } from '@/lib/pathDeLasCookies'
import { COOKIE_VISTA_PREVIA, puedeSimularRol } from '@/lib/vistaPrevia'
import type { Rol } from '@/access/reglas'

// El path no se escribe aquí: sale de `PATH_DE_LAS_COOKIES`, el mismo que usan
// `entrar()` y `salir()` para borrar esta cookie. Cuando estaba copiado en los
// dos archivos, bastaba con tocar uno para que el borrado apuntara a un path
// vacío y la simulación sobreviviera a cerrar la sesión. El porqué del prefijo
// está en `src/lib/pathDeLasCookies.ts`.

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
    // Con el path con el que se escribió, o no se borra nada.
    respuesta.cookies.delete({ name: COOKIE_VISTA_PREVIA, path: PATH_DE_LAS_COOKIES })
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
    path: PATH_DE_LAS_COOKIES,
    maxAge: 60 * 60 * 4,
  })
  return respuesta
}
