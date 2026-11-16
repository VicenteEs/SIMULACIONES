import { configuracionDelContador, type ConfiguracionDelContador } from '@/lib/contador'
import {
  leerActivos,
  leerMetricas,
  leerResumen,
  leerSerie,
  type FilaDeVisitas,
  type ResumenDeVisitas,
} from '@/lib/visitas'

/**
 * La plataforma frente a Umami (P-016 E7, D-408): lo deja listo la primera vez
 * y le pide las cifras para la pestaña «Monitoreo».
 *
 * **Listo la primera vez.** Umami nace con la cuenta `admin` y la contraseña
 * `umami`, y sin ningún sitio. Hacerlo a mano en su pantalla pedía abrirla a
 * internet, que es justo lo que se decidió no hacer. Así que lo hace la
 * plataforma: entra con la de fábrica, la cambia por `UMAMI_CLAVE` y crea el
 * sitio con el identificador `UMAMI_SITIO`, que es el que lleva el guion de
 * cada página. Todo se puede repetir sin daño: si la clave ya es la nueva, o el
 * sitio ya existe, no hace nada. Lo lanza el proceso que programa las tareas,
 * al arrancar (`instrumentation.ts`), y otra vez la pestaña si hiciera falta.
 *
 * Si dos procesos lo intentaran a la vez, el segundo encontraría la clave ya
 * cambiada: por eso, si la de fábrica no entra, se prueba la nueva otra vez.
 */

const CLAVE_DE_FABRICA = 'umami'
const NOMBRE_DEL_SITIO = 'TraumaHub'
/** Lo que dura la sesión con Umami en la memoria de cada proceso. Umami no dice cuánto vale su testigo. */
const DURACION_DE_LA_SESION_MS = 30 * 60 * 1000

const LLAVE = Symbol.for('traumahub.umami')

interface Memoria {
  testigo?: { valor: string; hasta: number }
  sitioListo?: boolean
}

const memoria = (): Memoria => {
  const global = globalThis as unknown as { [LLAVE]?: Memoria }
  global[LLAVE] ??= {}
  return global[LLAVE]
}

export class ErrorDeUmami extends Error {}

async function pedir(
  configuracion: ConfiguracionDelContador,
  camino: string,
  { metodo = 'GET', cuerpo, testigo }: { metodo?: string; cuerpo?: unknown; testigo?: string } = {},
): Promise<Response> {
  try {
    return await fetch(`${configuracion.url}${camino}`, {
      method: metodo,
      headers: {
        accept: 'application/json',
        ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(testigo ? { authorization: `Bearer ${testigo}` } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
  } catch (error) {
    throw new ErrorDeUmami(`Umami no responde (${(error as Error).message}).`)
  }
}

/** El testigo, o `null` si la clave no entra. Cualquier otra respuesta es un error de verdad. */
async function entrar(configuracion: ConfiguracionDelContador, clave: string): Promise<string | null> {
  const respuesta = await pedir(configuracion, '/api/auth/login', {
    metodo: 'POST',
    cuerpo: { username: configuracion.usuario, password: clave },
  })
  if (respuesta.status === 401 || respuesta.status === 400 || respuesta.status === 403) return null
  if (!respuesta.ok) throw new ErrorDeUmami(`Umami respondió ${respuesta.status} al entrar.`)
  const { token } = (await respuesta.json()) as { token?: unknown }
  if (typeof token !== 'string' || !token) throw new ErrorDeUmami('Umami no devolvió un testigo al entrar.')
  return token
}

/** Entra con la clave de fábrica y la cambia por la de `UMAMI_CLAVE`. */
async function cambiarLaClaveDeFabrica(configuracion: ConfiguracionDelContador): Promise<string | null> {
  const deFabrica = await entrar(configuracion, CLAVE_DE_FABRICA)
  if (!deFabrica) return null
  const respuesta = await pedir(configuracion, '/api/me/password', {
    metodo: 'POST',
    testigo: deFabrica,
    cuerpo: { currentPassword: CLAVE_DE_FABRICA, newPassword: configuracion.clave },
  })
  if (!respuesta.ok) throw new ErrorDeUmami(`Umami respondió ${respuesta.status} al cambiar su clave de fábrica.`)
  return entrar(configuracion, configuracion.clave)
}

async function testigoDeUmami(configuracion: ConfiguracionDelContador, renovar = false): Promise<string> {
  const guardado = memoria().testigo
  if (!renovar && guardado && guardado.hasta > Date.now()) return guardado.valor
  const valor =
    (await entrar(configuracion, configuracion.clave)) ??
    (await cambiarLaClaveDeFabrica(configuracion)) ??
    // Otro proceso la cambió entre las dos.
    (await entrar(configuracion, configuracion.clave))
  if (!valor) {
    throw new ErrorDeUmami(
      'Umami no acepta ni UMAMI_CLAVE ni su clave de fábrica. Si se cambió la clave en el .env después de prepararlo, hay que volver a la de antes o rehacer Umami.',
    )
  }
  memoria().testigo = { valor, hasta: Date.now() + DURACION_DE_LA_SESION_MS }
  return valor
}

/** El dominio del sitio en Umami: el de `NEXT_PUBLIC_SERVER_URL`. Solo es un rótulo; Umami no lo usa para filtrar. */
function dominioPropio(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SERVER_URL ?? '').hostname || 'traumahub.cl'
  } catch {
    return 'traumahub.cl'
  }
}

async function asegurarElSitio(configuracion: ConfiguracionDelContador, testigo: string): Promise<void> {
  if (memoria().sitioListo) return
  const existe = await pedir(configuracion, `/api/websites/${configuracion.sitio}`, { testigo })
  if (existe.ok) {
    memoria().sitioListo = true
    return
  }
  if (existe.status !== 404) throw new ErrorDeUmami(`Umami respondió ${existe.status} al buscar el sitio.`)
  const creado = await pedir(configuracion, '/api/websites', {
    metodo: 'POST',
    testigo,
    cuerpo: { id: configuracion.sitio, name: NOMBRE_DEL_SITIO, domain: dominioPropio() },
  })
  if (!creado.ok) throw new ErrorDeUmami(`Umami respondió ${creado.status} al crear el sitio.`)
  memoria().sitioListo = true
}

export type EstadoDeUmami = { estado: 'sin-configurar' } | { estado: 'listo' } | { estado: 'error'; detalle: string }

/** Deja Umami con su clave y su sitio. No lanza: lo que falla, lo dice. */
export async function prepararUmami(configuracion = configuracionDelContador()): Promise<EstadoDeUmami> {
  if (!configuracion) return { estado: 'sin-configurar' }
  try {
    await asegurarElSitio(configuracion, await testigoDeUmami(configuracion))
    return { estado: 'listo' }
  } catch (error) {
    return { estado: 'error', detalle: (error as Error).message }
  }
}

/**
 * Una consulta con testigo. Si Umami lo rechaza —se reinició, o venció—, se
 * entra otra vez y se repite una sola vez.
 */
async function consultar(configuracion: ConfiguracionDelContador, camino: string): Promise<unknown> {
  let respuesta = await pedir(configuracion, camino, { testigo: await testigoDeUmami(configuracion) })
  if (respuesta.status === 401) {
    respuesta = await pedir(configuracion, camino, { testigo: await testigoDeUmami(configuracion, true) })
  }
  if (!respuesta.ok) throw new ErrorDeUmami(`Umami respondió ${respuesta.status} a ${camino.split('?')[0]}.`)
  return respuesta.json()
}

export interface VisitasDelPeriodo {
  resumen: ResumenDeVisitas | null
  serie: Map<string, number>
  paginas: FilaDeVisitas[]
  sitios: FilaDeVisitas[]
  origenes: FilaDeVisitas[]
  paises: FilaDeVisitas[]
  equipos: FilaDeVisitas[]
  activos: number | null
}

const FILAS_POR_LISTA = 12

export async function visitasDelPeriodo(
  configuracion: ConfiguracionDelContador,
  { desde, hasta, unidad }: { desde: Date; hasta: Date; unidad: 'hour' | 'day' },
): Promise<VisitasDelPeriodo> {
  await asegurarElSitio(configuracion, await testigoDeUmami(configuracion))
  const base = `/api/websites/${configuracion.sitio}`
  const rango = `startAt=${desde.getTime()}&endAt=${hasta.getTime()}`
  const metricas = (tipo: string) => consultar(configuracion, `${base}/metrics?type=${tipo}&${rango}&limit=${FILAS_POR_LISTA}`)

  const [resumen, serie, paginas, sitios, origenes, paises, equipos, activos] = await Promise.all([
    consultar(configuracion, `${base}/stats?${rango}`),
    consultar(configuracion, `${base}/pageviews?${rango}&unit=${unidad}&timezone=America%2FSantiago`),
    metricas('path'),
    metricas('hostname'),
    metricas('referrer'),
    metricas('country'),
    metricas('device'),
    // Los activos no son esenciales: si esta ruta cambiara de nombre, el
    // resto de la pestaña sigue.
    consultar(configuracion, `${base}/active`).catch(() => null),
  ])

  return {
    resumen: leerResumen(resumen),
    serie: leerSerie(serie, 'pageviews'),
    paginas: leerMetricas(paginas),
    sitios: leerMetricas(sitios),
    origenes: leerMetricas(origenes),
    paises: leerMetricas(paises),
    equipos: leerMetricas(equipos),
    activos: leerActivos(activos),
  }
}
