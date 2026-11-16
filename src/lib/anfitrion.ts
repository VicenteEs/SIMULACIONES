/**
 * De qué institución es una petición, según el anfitrión al que llega (D-371,
 * D-396).
 *
 * `uchile.traumahub.cl` es la institución `uchile`; `traumahub.cl` y
 * `www.traumahub.cl`, la central. Lo calcula `proxy.ts` una vez por petición y
 * lo deja en `CABECERA_DEL_SUBDOMINIO`, que el resto del servidor lee en vez de
 * volver a mirar el anfitrión.
 *
 * Puro y sin Next, para probarlo solo y para que el proxy lo pueda importar.
 */

/**
 * La cabecera que el proxy escribe en cada petición. Vacía es la central.
 *
 * El proxy la escribe siempre, también vacía: la que mande el navegador se
 * pisa. Si no, cualquiera podría decir que viene de otra institución.
 */
export const CABECERA_DEL_SUBDOMINIO = 'x-traumahub-subdominio'

/**
 * En el servidor de pruebas, la institución elegida con el selector (D-371:
 * Tailscale Funnel no admite subdominios, y ved no tiene). Fuera de él, el
 * proxy no la mira.
 */
export const COOKIE_DE_LA_INSTITUCION_DE_PRUEBA = 'traumahub-institucion-de-prueba'

/**
 * Un nombre que sea posible como subdominio, sin mirar si está reservado: eso
 * es de la colección. Sirve para no pasarle a la base cualquier cosa que llegue
 * en una cookie.
 */
const PARECE_SUBDOMINIO = /^[a-z0-9-]{1,63}$/

/**
 * El dominio bajo el que viven las instituciones: `DOMINIO_DE_INSTITUCIONES`
 * si está, o el servidor de la dirección pública. En Contabo sale
 * `traumahub.cl` sin configurar nada; en ved, el de Tailscale, que no recibe
 * subdominios, y en desarrollo `localhost`.
 */
export function dominioDeInstituciones(
  variable: string | undefined = process.env.DOMINIO_DE_INSTITUCIONES,
  direccionPublica: string | undefined = process.env.NEXT_PUBLIC_SERVER_URL,
): string {
  const directo = (variable ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '')
  if (directo) return directo
  try {
    return new URL(direccionPublica ?? '').hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** El anfitrión sin puerto y en minúsculas: `UChile.TraumaHub.cl:443` → `uchile.traumahub.cl`. */
export function sinPuerto(anfitrion: string): string {
  const limpio = anfitrion.trim().toLowerCase()
  // Una IPv6 va entre corchetes, y sus dos puntos no son el puerto.
  if (limpio.startsWith('[')) return limpio.slice(0, limpio.indexOf(']') + 1)
  return limpio.split(':')[0]
}

/**
 * El subdominio de un anfitrión bajo alguno de los dominios, o `''` si es la
 * central.
 *
 * - El dominio mismo y `www` son la central.
 * - Un anfitrión fuera de los dominios (la IP, el nombre de Tailscale de ved)
 *   también: es la plataforma de siempre.
 * - Un subdominio de dos niveles (`a.b.traumahub.cl`) sale entero, con su
 *   punto, y no hay institución que se llame así: la página dirá que no existe.
 *
 * `localhost` va siempre entre los dominios, además del configurado: el PDF se
 * imprime pidiendo la página a `uchile.localhost` desde el propio servidor
 * (`pdfServidor.ts`), y en desarrollo es la forma de probar una institución.
 * Desde fuera no se alcanza: Cloudflare solo deja pasar los nombres de la zona.
 */
export function subdominioDelAnfitrion(anfitrion: string | null | undefined, dominio: string): string {
  if (!anfitrion) return ''
  const nombre = sinPuerto(anfitrion)
  for (const base of [dominio, 'localhost']) {
    if (!base || nombre === base) continue
    if (nombre.endsWith(`.${base}`)) {
      const sub = nombre.slice(0, -(base.length + 1))
      return sub === 'www' ? '' : sub
    }
  }
  return ''
}

/**
 * El subdominio de la petición, que es lo que el proxy deja en la cabecera.
 *
 * En el servidor de pruebas, y solo si el anfitrión no trae subdominio, manda la
 * cookie del selector. Lo que traiga la cookie se acepta solo si parece un
 * subdominio: si no, la central.
 */
export function subdominioDeLaPeticion({
  anfitrion,
  dominio,
  enPruebas,
  cookieDePrueba,
}: {
  anfitrion: string | null | undefined
  dominio: string
  enPruebas: boolean
  cookieDePrueba?: string | null
}): string {
  const delAnfitrion = subdominioDelAnfitrion(anfitrion, dominio)
  if (delAnfitrion || !enPruebas) return delAnfitrion
  return normalizarSubdominioPedido(cookieDePrueba)
}

/**
 * Lo que llega del selector de ved o de su cookie, en minúsculas y sin
 * espacios, si parece un subdominio; si no, `''`, la central.
 */
export function normalizarSubdominioPedido(valor: unknown): string {
  const limpio = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  return PARECE_SUBDOMINIO.test(limpio) ? limpio : ''
}

/**
 * La lista de orígenes de confianza que Payload compara con la cabecera
 * `Origin` antes de creerle la cookie de sesión (`csrf`, en `extractJWT`).
 *
 * Payload solo pregunta `includes(origen)`, y con una lista fija haría falta
 * reiniciar el servidor por cada institución nueva: sin su origen en la lista,
 * toda acción de servidor de su subdominio llegaría sin sesión. Esta lista
 * contesta que sí, además, a cualquier subdominio de un solo nivel del dominio
 * de las instituciones, con el esquema y el puerto de la dirección pública.
 * Que la institución exista no se mira aquí: en un subdominio sin institución
 * no vale ninguna cuenta (`obtenerSesion`, `beforeLogin`).
 *
 * `Symbol.species` es `Array` para que un `map` o un `filter` sobre la lista,
 * si Payload los hiciera, devolvieran un arreglo corriente y no llamaran a este
 * constructor con un número.
 */
export class OrigenesDeConfianza extends Array<string> {
  static override get [Symbol.species]() {
    return Array
  }

  readonly #base: URL | null
  readonly #dominio: string

  constructor(direccionPublica: string, dominio: string) {
    super()
    let base: URL | null = null
    try {
      base = new URL(direccionPublica)
    } catch {
      base = null
    }
    this.#base = base
    this.#dominio = dominio
  }

  override includes(origen: string, desde?: number): boolean {
    if (super.includes(origen, desde)) return true
    return this.#base !== null && esOrigenDeInstitucion(origen, this.#base, this.#dominio)
  }
}

function esOrigenDeInstitucion(origen: string, base: URL, dominio: string): boolean {
  if (!dominio) return false
  let url: URL
  try {
    url = new URL(origen)
  } catch {
    return false
  }
  if (url.origin !== origen || url.protocol !== base.protocol || url.port !== base.port) return false
  if (!url.hostname.endsWith(`.${dominio}`)) return false
  const sub = url.hostname.slice(0, -(dominio.length + 1))
  return PARECE_SUBDOMINIO.test(sub)
}

/**
 * La dirección pública de una institución, para los enlaces de los correos: la
 * central con el subdominio delante del servidor, y el resto igual, prefijo
 * incluido (`https://traumahub.cl/x` → `https://uchile.traumahub.cl/x`).
 *
 * Sin subdominio, o con una dirección que no se puede leer, devuelve la que
 * recibe: un enlace a la central es mejor que ninguno, y quien lo siga verá
 * dónde está.
 */
export function direccionDeLaInstitucion(subdominio: string, direccionPublica: string): string {
  if (!subdominio) return direccionPublica
  try {
    const url = new URL(direccionPublica)
    url.hostname = `${subdominio}.${url.hostname.replace(/^www\./, '')}`
    return url.toString().replace(/\/+$/, '')
  } catch {
    return direccionPublica
  }
}
