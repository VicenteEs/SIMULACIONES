import { NextResponse } from 'next/server'
import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { PREFIJO } from '@/lib/rutas'
import { COOKIE_VISTA_PREVIA, puedeSimularRol } from '@/lib/vistaPrevia'
import type { Rol } from '@/access/reglas'

/**
 * El mismo path que el testigo de sesión: el prefijo, no la raíz.
 *
 * En el servidor la plataforma comparte esquema, dominio y puerto con otras
 * páginas detrás del mismo proxy. Con `path: '/'` esta cookie viajaba a todas
 * ellas, igual que viajaba el testigo antes de 66bdc2d. No abre nada —solo
 * puede rebajar el rol, y `rolEfectivo` la valida contra el real—, pero es una
 * cookie de esta plataforma paseándose por sitios que no son suyos.
 *
 * El valor está escrito aquí y en `acciones/sesion.ts` (`PATH_VISTA_PREVIA`)
 * porque esa acción lleva `'use server'` y no puede exportar una constante. Los
 * dos tienen que decir lo mismo: lo que se escribe aquí lo borra `salir()`, y
 * un `delete` con otro path no caduca nada —la simulación sobreviviría a cerrar
 * la sesión y la siguiente empezaría viendo la plataforma como otro rol—.
 */
const PATH_COOKIE = PREFIJO || '/'

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
    respuesta.cookies.delete({ name: COOKIE_VISTA_PREVIA, path: PATH_COOKIE })
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
    path: PATH_COOKIE,
    maxAge: 60 * 60 * 4,
  })
  return respuesta
}
