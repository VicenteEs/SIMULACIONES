/**
 * El contador de visitas por página (P-016 E7, D-408): Umami, instalado en el
 * propio servidor y escondido en su red interna.
 *
 * El navegador no habla nunca con Umami. Pide el guion y manda cada visita a
 * la plataforma (`/api/visitas/…`), y la plataforma se las pasa a Umami por
 * dentro. Así no se abre nada nuevo a internet, no hay un dominio de terceros
 * en la página y lo que llega a Umami pasa antes por aquí, que es donde se le
 * quita lo que no tiene por qué guardar:
 *
 * - **la consulta y el fragmento** de la dirección (`?invitacion=…`,
 *   `#…`): llevan enlaces de invitación y de contraseña;
 * - **el testigo de `/clave/…`**, que es una contraseña de un solo uso, y los
 *   números del panel (`/admin-panel/cotizaciones/12`), que apuntan a una
 *   persona concreta;
 * - **el título** de la página, que en el panel puede nombrar a alguien;
 * - **la página de origen**, de la que queda solo el sitio;
 * - **todo lo demás** que el guion de Umami sabe mandar y aquí no se usa:
 *   identificadores de persona, datos de eventos, la IP o el navegador
 *   «declarados». La IP la pone la plataforma, de la conexión, para que nadie
 *   la invente.
 *
 * Puro: la ruta que lo usa está en `api/visitas/api/send/route.ts`.
 */

export interface ConfiguracionDelContador {
  /** El identificador del sitio en Umami: lo elige `preparar-monitoreo.sh`. */
  sitio: string
  /** Dónde está Umami dentro de la red de Docker. */
  url: string
  usuario: string
  clave: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * La configuración, o `null` si este servidor no cuenta visitas. Solo
 * Contabo las cuenta (D-377): ved y el equipo de desarrollo no tienen Umami, y
 * sin `UMAMI_SITIO` la plataforma no pinta el guion ni acepta visitas.
 */
export function configuracionDelContador(
  entorno: Record<string, string | undefined> = process.env,
): ConfiguracionDelContador | null {
  const sitio = entorno.UMAMI_SITIO?.trim() ?? ''
  const clave = entorno.UMAMI_CLAVE ?? ''
  if (!UUID.test(sitio) || clave.length < 8) return null
  return {
    sitio: sitio.toLowerCase(),
    url: (entorno.UMAMI_URL?.trim() || 'http://umami:3000').replace(/\/+$/, ''),
    usuario: entorno.UMAMI_USUARIO?.trim() || 'admin',
    clave,
  }
}

const LARGO_MAXIMO_DE_LA_RUTA = 400

/**
 * Un tramo de la ruta que parece un testigo y no un nombre: largo, sin
 * espacios y con algún número. Los nombres de la plataforma son cortos o son
 * palabras con guiones; un testigo de 24 caracteres al azar casi siempre trae
 * algún dígito.
 */
const pareceTestigo = (tramo: string) => tramo.length >= 24 && /^[A-Za-z0-9_-]+$/.test(tramo) && /\d/.test(tramo)

/** La ruta de una visita, sin nada que identifique a nadie. */
export function rutaSinDatos(direccion: string): string | null {
  let ruta: string
  try {
    ruta = new URL(direccion, 'https://contador.invalid').pathname
  } catch {
    return null
  }
  const tramos = ruta.split('/')
  // Donde sea y no solo al principio: bajo un prefijo (`/traumahub/…`, D-383)
  // el panel es el segundo tramo, y sus números salían enteros.
  const enElPanel = tramos.includes('admin-panel')
  const limpia = tramos
    .map((tramo, i) => {
      if (i > 0 && tramos[i - 1] === 'clave' && tramo) return ':testigo'
      if (enElPanel && /^\d+$/.test(tramo)) return ':id'
      if (UUID.test(tramo)) return ':id'
      if (pareceTestigo(tramo)) return ':testigo'
      return tramo
    })
    .join('/')
  return limpia.slice(0, LARGO_MAXIMO_DE_LA_RUTA) || '/'
}

/** De la página de origen, solo el sitio, y solo si es de fuera. */
export function origenSinDatos(referente: unknown, propio: string): string {
  if (typeof referente !== 'string' || !referente) return ''
  try {
    const url = new URL(referente)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    const base = dominioBase(propio)
    // La central vista desde una institución también es de casa: con solo
    // los subdominios, `traumahub.cl` salía como origen de fuera de
    // `hospital.traumahub.cl`.
    if (url.hostname === propio || url.hostname === base || url.hostname.endsWith(`.${base}`)) return ''
    return url.origin
  } catch {
    return ''
  }
}

/**
 * `traumahub.cl` para `hospital.traumahub.cl`: lo que viene de otra
 * institución, o de la central, no es una visita de fuera.
 */
function dominioBase(nombre: string): string {
  const partes = nombre.split('.')
  return partes.length > 2 ? partes.slice(-2).join('.') : nombre
}

const PANTALLA = /^\d{2,5}x\d{2,5}$/
const IDIOMA = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,3}$/

export interface VisitaParaUmami {
  type: 'event'
  payload: {
    website: string
    hostname: string
    url: string
    referrer: string
    screen?: string
    language?: string
  }
}

/**
 * Lo que se le pasa a Umami de una visita que mandó el navegador, o `null` si
 * no es una visita. `hostname` es el sitio por el que llegó la petición, no el
 * que dice el navegador: así nadie cuenta visitas a nombre de otro dominio.
 */
export function visitaParaUmami(cuerpo: unknown, sitio: string, hostname: string): VisitaParaUmami | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null
  const { type, payload } = cuerpo as { type?: unknown; payload?: unknown }
  // Las visitas son `event` sin nombre. `identify` ata la sesión a una
  // persona y `performance` no se pidió: no pasan.
  if (type !== 'event' || !payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (p.name !== undefined && p.name !== null && p.name !== '') return null
  if (typeof p.url !== 'string') return null
  const url = rutaSinDatos(p.url)
  if (!url) return null
  return {
    type: 'event',
    payload: {
      website: sitio,
      hostname,
      url,
      referrer: origenSinDatos(p.referrer, hostname),
      ...(typeof p.screen === 'string' && PANTALLA.test(p.screen) ? { screen: p.screen } : {}),
      ...(typeof p.language === 'string' && IDIOMA.test(p.language) ? { language: p.language } : {}),
    },
  }
}

/** Visitas por minuto que acepta cada proceso de cada dirección. */
export const VISITAS_POR_MINUTO = 60

/** Lo más que se lee del cuerpo de una visita: el guion manda unos cientos de bytes. */
export const BYTES_MAXIMOS_DE_UNA_VISITA = 4096
