import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  COOKIE_DE_LA_INSTITUCION_DE_PRUEBA,
  LUGAR_DE_LA_CENTRAL,
  destinoDelLugar,
  normalizarSubdominioPedido,
} from '@/lib/anfitrion'
import { institucionPorSubdominio } from '@/lib/institucionesServidor'
import { anotarLaEntradaDelSoporteEnPruebas, opcionesDeLaCookieDePrueba } from '@/lib/institucionDePruebaServidor'
import { PATH_DE_LAS_COOKIES } from '@/lib/pathDeLasCookies'
import { ruta } from '@/lib/rutas'
import { servidorDePruebas } from '@/lib/servidorDePruebas'

export const dynamic = 'force-dynamic'

/**
 * Los enlaces a un lugar en ved: `/lugar/<subdominio>/<ruta>` (P-016 E5.10,
 * D-405).
 *
 * ved no tiene subdominios (D-371), y el lugar lo dice la cookie del selector.
 * Un enlace de un correo o del panel no puede llevar esa cookie, así que pasa
 * por aquí: se fija el lugar y se sigue a la ruta, con su consulta. Lo arma
 * `direccionDelLugar`, que en Contabo da el subdominio de verdad y nunca pasa
 * por aquí.
 *
 * Sin esto, el enlace de invitación de una institución llevaba en ved a la
 * central, que no mira el código: la cuenta nacía en TraumaHub. Y el de la
 * clave nueva de una cuenta de institución abría donde estuviera la cookie, que
 * casi nunca era su institución.
 *
 * - `traumahub` es la central, y borra la cookie. Ninguna institución puede
 *   llamarse así (`NOMBRES_RESERVADOS`).
 * - Una institución que no existe se fija igual, y se ve «Esta institución no
 *   existe», como en un subdominio mal escrito de Contabo.
 * - El administrador de TraumaHub que sigue el enlace de una institución entra
 *   como su soporte, y queda anotado como con el selector (D-404).
 *
 * Fuera del servidor de pruebas no existe: el proxy no miraría la cookie.
 */
export async function GET(
  peticion: NextRequest,
  { params }: { params: Promise<{ subdominio: string; resto?: string[] }> },
) {
  if (!servidorDePruebas(process.env.SERVIDOR_DE_PRUEBAS)) {
    return new NextResponse('No encontrado.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  const { subdominio, resto } = await params
  const elegido = normalizarSubdominioPedido(subdominio)
  // Relativa y con el prefijo: el navegador la resuelve contra la dirección a
  // la que llegó, que es la pública, y no contra la del contenedor.
  const respuesta = new NextResponse(null, {
    status: 303,
    headers: { Location: ruta(destinoDelLugar(resto, peticion.nextUrl.search)), 'Cache-Control': 'no-store' },
  })

  if (!elegido || elegido === LUGAR_DE_LA_CENTRAL) {
    // Con el mismo path con que se escribió: si no, el borrado no caduca nada.
    respuesta.cookies.delete({ name: COOKIE_DE_LA_INSTITUCION_DE_PRUEBA, path: PATH_DE_LAS_COOKIES })
    return respuesta
  }

  respuesta.cookies.set(COOKIE_DE_LA_INSTITUCION_DE_PRUEBA, elegido, opcionesDeLaCookieDePrueba())
  // Anotar no puede dejar a nadie sin llegar: el enlace sigue aunque la base
  // no conteste, y allí se verá lo que pase.
  try {
    const payload = await getPayload({ config })
    const institucion = await institucionPorSubdominio(payload, elegido)
    if (institucion) await anotarLaEntradaDelSoporteEnPruebas(payload, institucion, peticion.headers)
  } catch (error) {
    console.error('No se pudo anotar la entrada por un enlace de ved', error)
  }
  return respuesta
}
