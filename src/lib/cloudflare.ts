/**
 * El tráfico y los ataques que ve Cloudflare, para la pestaña «Monitoreo»
 * (P-016 E7, D-408). Puro: arma las consultas a su API de GraphQL y lee las
 * respuestas. La llamada está en `cloudflareServidor.ts`.
 *
 * **Qué da el plan gratuito**, que es el de la zona (límites de la API de
 * análisis, comprobados el 2026-11-16):
 * - `httpRequests1dGroups`: el tráfico por día, un año hacia atrás;
 * - `firewallEventsAdaptive`: cada evento de seguridad, 14 días hacia atrás.
 *   Su versión agrupada (`firewallEventsAdaptiveGroups`) no está en el plan
 *   gratuito, así que se piden los eventos sueltos y se cuentan aquí.
 *
 * **Lo que no se pide**: la IP, la red y el navegador de quien hizo cada
 * petición bloqueada. Cloudflare los tiene, pero mirarlos en el panel sería
 * tratarlos aquí también, y para saber si hay un ataque basta con qué se hizo,
 * desde qué país y contra qué ruta.
 *
 * Los valores van escritos dentro de la consulta y no como variables: así no
 * hay que acertar el nombre exacto de cada tipo del esquema de Cloudflare,
 * que no se puede consultar sin un token. Antes se validan: la zona son 32
 * caracteres hexadecimales y las fechas las escribe esta misma función.
 */

export interface ConfiguracionDeCloudflare {
  token: string
  zona: string
}

const ZONA = /^[0-9a-f]{32}$/

/** La configuración, o `null` si este servidor no tiene el token (ved, desarrollo). */
export function configuracionDeCloudflare(
  entorno: Record<string, string | undefined> = process.env,
): ConfiguracionDeCloudflare | null {
  const token = entorno.CLOUDFLARE_TOKEN?.trim() ?? ''
  const zona = entorno.CLOUDFLARE_ZONA?.trim().toLowerCase() ?? ''
  if (token.length < 20 || !ZONA.test(zona)) return null
  return { token, zona }
}

/** Días de tráfico que se piden. */
export const DIAS_DE_TRAFICO = 30
/** Días de eventos de seguridad: los 14 que guarda el plan gratuito sobran, una semana basta para ver si algo empezó. */
export const DIAS_DE_SEGURIDAD = 7
/** Eventos que se piden como mucho. Si se llega al tope, la pestaña dice «al menos». */
export const TOPE_DE_EVENTOS = 1000

const dia = (fecha: Date) => fecha.toISOString().slice(0, 10)
const instante = (fecha: Date) => `${fecha.toISOString().slice(0, 19)}Z`

export function consultaDelTrafico(zona: string, ahora: Date): string {
  if (!ZONA.test(zona)) throw new Error('Zona de Cloudflare inválida.')
  const desde = new Date(ahora.getTime() - (DIAS_DE_TRAFICO - 1) * 86_400_000)
  return `{
  viewer {
    zones(filter: { zoneTag: "${zona}" }) {
      httpRequests1dGroups(
        limit: ${DIAS_DE_TRAFICO + 1}
        filter: { date_geq: "${dia(desde)}", date_leq: "${dia(ahora)}" }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum {
          requests
          cachedRequests
          bytes
          threats
          pageViews
          countryMap { clientCountryName requests threats }
        }
        uniq { uniques }
      }
    }
  }
}`
}

export function consultaDeLaSeguridad(zona: string, ahora: Date): string {
  if (!ZONA.test(zona)) throw new Error('Zona de Cloudflare inválida.')
  const desde = new Date(ahora.getTime() - DIAS_DE_SEGURIDAD * 86_400_000)
  return `{
  viewer {
    zones(filter: { zoneTag: "${zona}" }) {
      firewallEventsAdaptive(
        limit: ${TOPE_DE_EVENTOS}
        filter: { datetime_geq: "${instante(desde)}", datetime_leq: "${instante(ahora)}" }
        orderBy: [datetime_DESC]
      ) {
        action
        source
        clientCountryName
        clientRequestPath
        datetime
      }
    }
  }
}`
}

const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** El mensaje de error de una respuesta de GraphQL, o `null` si no trae ninguno. */
export function errorDeLaRespuesta(crudo: unknown): string | null {
  if (!crudo || typeof crudo !== 'object') return 'Cloudflare respondió algo que no es JSON.'
  const errores = (crudo as { errors?: unknown }).errors
  if (!Array.isArray(errores) || errores.length === 0) return null
  return errores
    .map((e) => (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : 'error sin mensaje'))
    .join(' · ')
}

/** La primera zona de la respuesta: la consulta filtra por una sola. */
function zonaDe(crudo: unknown): Record<string, unknown> | null {
  const zonas = (crudo as { data?: { viewer?: { zones?: unknown } } })?.data?.viewer?.zones
  return Array.isArray(zonas) && zonas[0] && typeof zonas[0] === 'object' ? (zonas[0] as Record<string, unknown>) : null
}

export interface DiaDeTrafico {
  fecha: string
  peticiones: number
  enCache: number
  bytes: number
  amenazas: number
  vistas: number
  visitantes: number
}

export interface PaisDeTrafico {
  pais: string
  peticiones: number
  amenazas: number
}

export interface TraficoDeCloudflare {
  dias: DiaDeTrafico[]
  paises: PaisDeTrafico[]
}

export function leerTrafico(crudo: unknown): TraficoDeCloudflare | null {
  const zona = zonaDe(crudo)
  const grupos = zona?.httpRequests1dGroups
  if (!Array.isArray(grupos)) return null
  const paises = new Map<string, PaisDeTrafico>()
  const dias = grupos.flatMap((g) => {
    const fecha = (g as { dimensions?: { date?: unknown } })?.dimensions?.date
    if (typeof fecha !== 'string') return []
    const suma = ((g as { sum?: unknown }).sum ?? {}) as Record<string, unknown>
    const unicos = ((g as { uniq?: unknown }).uniq ?? {}) as Record<string, unknown>
    for (const p of Array.isArray(suma.countryMap) ? suma.countryMap : []) {
      const nombre = (p as { clientCountryName?: unknown })?.clientCountryName
      if (typeof nombre !== 'string') continue
      const previo = paises.get(nombre) ?? { pais: nombre, peticiones: 0, amenazas: 0 }
      previo.peticiones += numero((p as { requests?: unknown }).requests)
      previo.amenazas += numero((p as { threats?: unknown }).threats)
      paises.set(nombre, previo)
    }
    return [
      {
        fecha,
        peticiones: numero(suma.requests),
        enCache: numero(suma.cachedRequests),
        bytes: numero(suma.bytes),
        amenazas: numero(suma.threats),
        vistas: numero(suma.pageViews),
        visitantes: numero(unicos.uniques),
      },
    ]
  })
  return {
    dias: dias.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    paises: [...paises.values()].sort((a, b) => b.peticiones - a.peticiones),
  }
}

export interface EventoDeSeguridad {
  fecha: Date
  accion: string
  origen: string
  pais: string
  ruta: string
}

export interface SeguridadDeCloudflare {
  eventos: EventoDeSeguridad[]
  /** ¿Se llegó al tope? Entonces hay al menos esos, quizá más. */
  tope: boolean
}

export function leerSeguridad(crudo: unknown): SeguridadDeCloudflare | null {
  const lista = zonaDe(crudo)?.firewallEventsAdaptive
  if (!Array.isArray(lista)) return null
  const eventos = lista.flatMap((e) => {
    if (!e || typeof e !== 'object') return []
    const o = e as Record<string, unknown>
    const fecha = typeof o.datetime === 'string' ? new Date(o.datetime) : null
    if (!fecha || Number.isNaN(fecha.getTime())) return []
    return [
      {
        fecha,
        accion: typeof o.action === 'string' ? o.action : '',
        origen: typeof o.source === 'string' ? o.source : '',
        pais: typeof o.clientCountryName === 'string' ? o.clientCountryName : '',
        ruta: typeof o.clientRequestPath === 'string' ? o.clientRequestPath.slice(0, 200) : '',
      },
    ]
  })
  return { eventos, tope: lista.length >= TOPE_DE_EVENTOS }
}

/** Cuántos eventos hay de cada valor de un campo, de mayor a menor. */
export function contarPor<T>(lista: T[], campo: (x: T) => string): { etiqueta: string; valor: number }[] {
  const cuenta = new Map<string, number>()
  for (const x of lista) cuenta.set(campo(x), (cuenta.get(campo(x)) ?? 0) + 1)
  return [...cuenta.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor)
}

const ACCIONES: Record<string, string> = {
  block: 'Bloqueada',
  challenge: 'Desafío',
  managed_challenge: 'Desafío gestionado',
  jschallenge: 'Desafío de JavaScript',
  js_challenge: 'Desafío de JavaScript',
  challenge_solved: 'Desafío superado',
  challenge_failed: 'Desafío fallido',
  log: 'Solo anotada',
  allow: 'Permitida',
  skip: 'Dejada pasar',
  connection_close: 'Conexión cerrada',
}

export const nombreDeLaAccion = (accion: string): string => ACCIONES[accion] ?? (accion || 'Sin acción')

const ORIGENES: Record<string, string> = {
  firewallManaged: 'Reglas administradas de Cloudflare',
  firewallCustom: 'Reglas propias',
  firewallRules: 'Reglas propias (antiguas)',
  securityLevel: 'Nivel de seguridad',
  bic: 'Integridad del navegador',
  hot: 'Protección de enlaces',
  waf: 'Cortafuegos de aplicaciones',
  ratelimit: 'Límite de peticiones',
  botFight: 'Modo contra bots',
  botManagement: 'Gestión de bots',
  l7ddos: 'Protección DDoS',
  validation: 'Validación de peticiones',
  asn: 'Regla por red',
  country: 'Regla por país',
  ip: 'Regla por IP',
  iprange: 'Regla por rango de IP',
  uablock: 'Bloqueo por navegador',
  zonelockdown: 'Cierre de la zona',
}

export const nombreDelOrigen = (origen: string): string => ORIGENES[origen] ?? (origen || 'Sin origen')
