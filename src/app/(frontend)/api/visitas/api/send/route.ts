import {
  BYTES_MAXIMOS_DE_UNA_VISITA,
  VISITAS_POR_MINUTO,
  configuracionDelContador,
  visitaParaUmami,
} from '@/lib/contador'
import { almacenEnMemoria, direccionDeQuienLlama } from '@/lib/ritmo'
import { vieneDeAqui } from '@/lib/origenDeLaPeticion'

export const dynamic = 'force-dynamic'

/**
 * Donde el guion de Umami manda cada visita (P-016 E7, D-408). La ruta es
 * `…/api/send` porque es la que el guion arma a partir de `data-host-url`.
 *
 * Abierta, como tiene que estar: la portada cuenta visitas sin sesión. Lo que
 * la cuida:
 *
 * - **solo desde la propia plataforma** (`vieneDeAqui`): otra página no puede
 *   contar visitas aquí desde el navegador de quien la abre;
 * - **un freno por dirección**, en la memoria de cada proceso y no en la base:
 *   cada visita sería una escritura más en `intentos`, y una visita de más o
 *   de menos no protege nada. Con cuatro procesos el tope real es cuatro
 *   veces este;
 * - **lo que pasa a Umami**, limpio (`visitaParaUmami`), con la IP de la
 *   conexión y el país que pone Cloudflare, nunca los que diga el navegador.
 *
 * Responde siempre sin error, también cuando descarta: el guion no reintenta,
 * y un 4xx solo llenaría la consola de quien navega.
 */

const almacen = almacenEnMemoria()

const nada = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

/** El sitio por el que llegó la petición, sin puerto. */
function anfitrion(peticion: Request): string {
  const reenviado = peticion.headers.get('x-forwarded-host')?.split(',')[0].trim()
  return (reenviado || peticion.headers.get('host') || '').replace(/:\d+$/, '').toLowerCase()
}

export async function POST(peticion: Request) {
  const configuracion = configuracionDelContador()
  if (!configuracion || !vieneDeAqui(peticion)) return nada()

  const direccion = direccionDeQuienLlama(peticion.headers)
  const permitida = await almacen.anotar('visitas', direccion.slice(0, 64), VISITAS_POR_MINUTO, 60_000, Date.now())
  if (!permitida) return nada()

  const largo = Number(peticion.headers.get('content-length') ?? 0)
  if (largo > BYTES_MAXIMOS_DE_UNA_VISITA) return nada()
  const texto = await peticion.text()
  if (texto.length > BYTES_MAXIMOS_DE_UNA_VISITA) return nada()

  let cuerpo: unknown
  try {
    cuerpo = JSON.parse(texto)
  } catch {
    return nada()
  }
  const sitio = anfitrion(peticion)
  const visita = sitio ? visitaParaUmami(cuerpo, configuracion.sitio, sitio) : null
  if (!visita) return nada()

  const cabeceras: Record<string, string> = {
    'content-type': 'application/json',
    // Umami descarta los robots por el navegador (`isbot`), y con él saca el
    // navegador, el sistema y el tipo de equipo de la visita.
    'user-agent': (peticion.headers.get('user-agent') ?? '').slice(0, 500),
  }
  // La IP solo sirve a Umami para reconocer la misma visita entre páginas,
  // mezclada con un secreto que cambia; no la guarda. Va en la cabecera que le
  // dice `CLIENT_IP_HEADER` (despliegue/paginas/docker-compose.override.yml).
  if (direccion !== 'desconocida') cabeceras['x-ip-de-la-visita'] = direccion
  // El país, el que pone Cloudflare. Sin él Umami lo buscaría por la IP en su
  // base de ciudades, que dice más de lo que hace falta.
  const pais = peticion.headers.get('cf-ipcountry')
  if (pais && /^[A-Z]{2}$/.test(pais)) cabeceras['cf-ipcountry'] = pais
  // La marca con que Umami reconoce la misma visita en la página siguiente:
  // la firmó él, y aquí solo se devuelve.
  const marca = peticion.headers.get('x-umami-cache')
  if (marca && marca.length < 2048) cabeceras['x-umami-cache'] = marca

  try {
    const respuesta = await fetch(`${configuracion.url}/api/send`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify(visita),
      signal: AbortSignal.timeout(3000),
    })
    if (!respuesta.ok) return nada()
    return new Response(await respuesta.text(), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  } catch {
    return nada()
  }
}
