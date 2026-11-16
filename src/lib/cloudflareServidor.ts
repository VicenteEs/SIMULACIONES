import {
  consultaDeLaSeguridad,
  consultaDelTrafico,
  errorDeLaRespuesta,
  leerSeguridad,
  leerTrafico,
  type ConfiguracionDeCloudflare,
  type SeguridadDeCloudflare,
  type TraficoDeCloudflare,
} from '@/lib/cloudflare'

/**
 * Las dos consultas a la API de análisis de Cloudflare (D-408), con el token
 * de solo lectura de `CLOUDFLARE_TOKEN`.
 *
 * Se guardan cinco minutos en la memoria de cada proceso, colgadas de
 * `globalThis` como los avisos: Cloudflare limita las consultas por token, y
 * sus cifras se mueven cada varios minutos de todos modos. Un error no se
 * guarda, para que la siguiente carga lo vuelva a intentar.
 */

const URL_DE_LA_API = 'https://api.cloudflare.com/client/v4/graphql'
const CINCO_MINUTOS_MS = 5 * 60 * 1000
const LLAVE = Symbol.for('traumahub.cloudflare')

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }

interface Guardado {
  trafico?: { valor: TraficoDeCloudflare; hasta: number }
  seguridad?: { valor: SeguridadDeCloudflare; hasta: number }
}

const memoria = (): Guardado => {
  const global = globalThis as unknown as { [LLAVE]?: Guardado }
  global[LLAVE] ??= {}
  return global[LLAVE]
}

async function preguntar(configuracion: ConfiguracionDeCloudflare, consulta: string): Promise<Resultado<unknown>> {
  let respuesta: Response
  try {
    respuesta = await fetch(URL_DE_LA_API, {
      method: 'POST',
      headers: { authorization: `Bearer ${configuracion.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: consulta }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
  } catch (error) {
    return { ok: false, error: `Cloudflare no responde (${(error as Error).message}).` }
  }
  let crudo: unknown
  try {
    crudo = await respuesta.json()
  } catch {
    return { ok: false, error: `Cloudflare respondió ${respuesta.status} sin JSON.` }
  }
  // Un token sin el permiso, o vencido, llega como 200 con `errors`, o como 4xx.
  const error = errorDeLaRespuesta(crudo)
  if (error) return { ok: false, error }
  if (!respuesta.ok) return { ok: false, error: `Cloudflare respondió ${respuesta.status}.` }
  return { ok: true, datos: crudo }
}

export async function traficoDeCloudflare(
  configuracion: ConfiguracionDeCloudflare,
  ahora = new Date(),
): Promise<Resultado<TraficoDeCloudflare>> {
  const guardado = memoria().trafico
  if (guardado && guardado.hasta > ahora.getTime()) return { ok: true, datos: guardado.valor }
  const respuesta = await preguntar(configuracion, consultaDelTrafico(configuracion.zona, ahora))
  if (!respuesta.ok) return respuesta
  const trafico = leerTrafico(respuesta.datos)
  if (!trafico) return { ok: false, error: 'La respuesta de Cloudflare no trae el tráfico de la zona. ¿Es la zona correcta?' }
  memoria().trafico = { valor: trafico, hasta: ahora.getTime() + CINCO_MINUTOS_MS }
  return { ok: true, datos: trafico }
}

export async function seguridadDeCloudflare(
  configuracion: ConfiguracionDeCloudflare,
  ahora = new Date(),
): Promise<Resultado<SeguridadDeCloudflare>> {
  const guardado = memoria().seguridad
  if (guardado && guardado.hasta > ahora.getTime()) return { ok: true, datos: guardado.valor }
  const respuesta = await preguntar(configuracion, consultaDeLaSeguridad(configuracion.zona, ahora))
  if (!respuesta.ok) return respuesta
  const seguridad = leerSeguridad(respuesta.datos)
  if (!seguridad) return { ok: false, error: 'La respuesta de Cloudflare no trae los eventos de seguridad de la zona.' }
  memoria().seguridad = { valor: seguridad, hasta: ahora.getTime() + CINCO_MINUTOS_MS }
  return { ok: true, datos: seguridad }
}
