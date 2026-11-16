import { NextResponse, type NextRequest } from 'next/server'
import {
  CABECERA_DEL_SUBDOMINIO,
  COOKIE_DE_LA_INSTITUCION_DE_PRUEBA,
  dominioDeInstituciones,
  subdominioDeLaPeticion,
} from '@/lib/anfitrion'
import { servidorDePruebas } from '@/lib/servidorDePruebas'

/**
 * El proxy de Next (el antiguo middleware): deja en cada petición el subdominio
 * de la institución a la que llega (D-371, D-396).
 *
 * Solo eso. No mira la sesión ni decide permisos: eso lo hacen las reglas y la
 * guardia de cada página, que tienen la base a mano. Aquí se calcula una vez lo
 * que el resto lee de la cabecera, y se pisa siempre lo que traiga el
 * navegador con ese nombre: sin eso, cualquiera diría que viene de otra
 * institución con solo mandarla.
 *
 * Corre en Node, que es lo único que admite el proxy desde Next 16, así que
 * lee las variables del servidor al correr y no al compilar.
 */
export function proxy(peticion: NextRequest) {
  const cabeceras = new Headers(peticion.headers)
  cabeceras.set(
    CABECERA_DEL_SUBDOMINIO,
    subdominioDeLaPeticion({
      anfitrion: peticion.headers.get('host'),
      dominio: dominioDeInstituciones(),
      enPruebas: servidorDePruebas(process.env.SERVIDOR_DE_PRUEBAS) !== null,
      cookieDePrueba: peticion.cookies.get(COOKIE_DE_LA_INSTITUCION_DE_PRUEBA)?.value,
    }),
  )
  return NextResponse.next({ request: { headers: cabeceras } })
}

export const config = {
  // Todo menos lo que Next sirve compilado: los archivos de `_next/static` y
  // las imágenes que optimiza. Las acciones de servidor, la API y los archivos
  // subidos sí pasan, y tienen que pasar: la segunda barrera de PostgreSQL
  // (D-396) saca de esta cabecera dónde está cada consulta.
  matcher: ['/((?!_next/static|_next/image).*)'],
}
