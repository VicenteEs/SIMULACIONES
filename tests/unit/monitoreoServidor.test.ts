import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepararUmami, visitasDelPeriodo } from '@/lib/visitasServidor'
import { seguridadDeCloudflare, traficoDeCloudflare } from '@/lib/cloudflareServidor'
import { leerElEstadoDelServidor } from '@/lib/estadoDelServidorServidor'

/**
 * La pestaña «Monitoreo» frente a lo que tiene fuera (P-016 E7, D-408): Umami,
 * la API de Cloudflare y la carpeta que deja el guion del anfitrión.
 *
 * Umami se imita entero, con su clave y sus sitios, porque lo que más importa
 * de esta parte es que la plataforma lo deja listo sola —cambia su clave de
 * fábrica y crea el sitio— y que lo puede hacer dos veces sin romper nada.
 */

const SITIO = '6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b'
const configuracion = { sitio: SITIO, url: 'http://umami:3000', usuario: 'admin', clave: 'clave-nueva-de-umami' }

/** Un Umami de mentira: su clave, sus sitios y lo que se le pidió. */
function umamiDePrueba() {
  const umami = {
    clave: 'umami',
    sitios: new Map<string, Record<string, unknown>>(),
    caido: false,
    rechazarElPrimerTestigo: false,
    // Umami 3.4.1, el de la producción, responde 200 con `null` por un sitio
    // que no existe (D-409). Se imita eso por omisión; '404' es lo que cabría
    // esperar de una API y lo que imitaba esta prueba cuando dejó pasar el fallo.
    sitioQueNoExiste: 'nulo' as 'nulo' | '404',
    ignorarElId: false,
    pedidas: [] as string[],
  }
  const responder = async (url: string, init: RequestInit = {}): Promise<Response> => {
    if (umami.caido) throw new Error('connect ECONNREFUSED')
    const metodo = init.method ?? 'GET'
    const { pathname, search } = new URL(url)
    umami.pedidas.push(`${metodo} ${pathname}${search}`)
    const cuerpo = init.body ? JSON.parse(init.body as string) : null
    const testigo = (init.headers as Record<string, string>)?.authorization?.replace('Bearer ', '')

    if (pathname === '/api/auth/login') {
      return cuerpo.username === 'admin' && cuerpo.password === umami.clave
        ? Response.json({ token: `testigo-${umami.clave}` })
        : new Response('{"error":"Incorrect username and/or password."}', { status: 401 })
    }
    if (testigo !== `testigo-${umami.clave}`) return new Response('', { status: 401 })
    if (umami.rechazarElPrimerTestigo) {
      umami.rechazarElPrimerTestigo = false
      return new Response('', { status: 401 })
    }
    if (pathname === '/api/me/password' && metodo === 'POST') {
      if (cuerpo.currentPassword !== umami.clave) return new Response('', { status: 400 })
      umami.clave = cuerpo.newPassword
      return Response.json({ ok: true })
    }
    if (pathname === '/api/websites' && metodo === 'POST') {
      const creado = umami.ignorarElId ? { ...cuerpo, id: '11111111-2222-4333-8444-555555555555' } : cuerpo
      umami.sitios.set(creado.id, creado)
      return Response.json(creado)
    }
    const sitio = pathname.match(/^\/api\/websites\/([^/]+)(\/.*)?$/)
    if (sitio) {
      if (!umami.sitios.has(sitio[1])) {
        return sitio[2] === undefined && umami.sitioQueNoExiste === 'nulo' ? Response.json(null) : new Response('', { status: 404 })
      }
      switch (sitio[2]) {
        case undefined:
          return Response.json(umami.sitios.get(sitio[1]))
        case '/stats':
          return Response.json({ pageviews: 30, visitors: 10, visits: 12, bounces: 4, totaltime: 600, comparison: { pageviews: 20, visitors: 8, visits: 9, bounces: 3, totaltime: 400 } })
        case '/pageviews':
          return Response.json({ pageviews: [{ x: '2026-11-16 00:00:00', y: 30 }], sessions: [] })
        case '/metrics':
          return Response.json([{ x: new URL(url).searchParams.get('type') === 'path' ? '/modulos' : 'traumahub.cl', y: 7 }])
        case '/active':
          return new Response('', { status: 404 })
      }
    }
    return new Response('', { status: 404 })
  }
  return { umami, responder }
}

let umami: ReturnType<typeof umamiDePrueba>['umami']

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('traumahub.umami')]
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('traumahub.cloudflare')]
  const doble = umamiDePrueba()
  umami = doble.umami
  vi.stubGlobal('fetch', vi.fn(doble.responder))
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://traumahub.cl')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('dejar Umami listo', () => {
  it('sin configuración no hace nada', async () => {
    expect(await prepararUmami(null)).toEqual({ estado: 'sin-configurar' })
    expect(umami.pedidas).toEqual([])
  })

  it('recién nacido: cambia la clave de fábrica y crea el sitio con su identificador', async () => {
    expect(await prepararUmami(configuracion)).toEqual({ estado: 'listo' })
    expect(umami.clave).toBe(configuracion.clave)
    expect(umami.sitios.get(SITIO)).toEqual({ id: SITIO, name: 'TraumaHub', domain: 'traumahub.cl' })
  })

  it('un 200 con `null` no es un sitio: lo crea igual (D-409)', async () => {
    // Lo que pasó en la producción: Umami 3.4.1 respondió 200 y `null`, la
    // plataforma escribió «Listo» y no creó nada.
    expect(umami.sitioQueNoExiste).toBe('nulo')
    await prepararUmami(configuracion)
    expect(umami.pedidas).toContain('POST /api/websites')
    expect(umami.sitios.has(SITIO)).toBe(true)
  })

  it('con un Umami que dice 404 por el sitio que falta, también lo crea', async () => {
    umami.sitioQueNoExiste = '404'
    expect(await prepararUmami(configuracion)).toEqual({ estado: 'listo' })
    expect(umami.sitios.has(SITIO)).toBe(true)
  })

  it('si Umami pone otro identificador al crearlo, lo dice: las visitas no llegarían', async () => {
    umami.ignorarElId = true
    const resultado = await prepararUmami(configuracion)
    expect(resultado).toEqual({ estado: 'error', detalle: expect.stringMatching(/UMAMI_SITIO/) })
    // Y no se da por listo: la próxima vez lo vuelve a mirar.
    umami.pedidas.length = 0
    await prepararUmami(configuracion)
    expect(umami.pedidas.some((p) => p.startsWith(`GET /api/websites/${SITIO}`))).toBe(true)
  })

  it('una segunda vez, en otro proceso, no cambia nada', async () => {
    await prepararUmami(configuracion)
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('traumahub.umami')]
    umami.pedidas.length = 0
    expect(await prepararUmami(configuracion)).toEqual({ estado: 'listo' })
    expect(umami.pedidas.filter((p) => p.startsWith('POST') && !p.includes('/auth/login'))).toEqual([])
  })

  it('si no entra ni con la clave ni con la de fábrica, lo dice', async () => {
    umami.clave = 'otra-que-alguien-puso'
    const resultado = await prepararUmami(configuracion)
    expect(resultado.estado).toBe('error')
    expect(resultado.estado === 'error' && resultado.detalle).toMatch(/UMAMI_CLAVE/)
  })

  it('con Umami caído, lo dice sin lanzar', async () => {
    umami.caido = true
    const resultado = await prepararUmami(configuracion)
    expect(resultado).toEqual({ estado: 'error', detalle: expect.stringMatching(/no responde/) })
  })
})

describe('las visitas del periodo', () => {
  const intervalo = { desde: new Date('2026-11-09T15:00:00Z'), hasta: new Date('2026-11-16T15:00:00Z'), unidad: 'day' as const }

  it('pide cada cifra con el periodo en milisegundos y la hora de Chile', async () => {
    const datos = await visitasDelPeriodo(configuracion, intervalo)
    expect(datos.resumen?.actual.vistas).toBe(30)
    expect(datos.resumen?.anterior?.vistas).toBe(20)
    expect(datos.serie.get('2026-11-16 00')).toBe(30)
    expect(datos.paginas).toEqual([{ etiqueta: '/modulos', valor: 7 }])
    // Los activos no existen en esta versión: la pestaña sigue sin ellos.
    expect(datos.activos).toBeNull()
    const serie = umami.pedidas.find((p) => p.includes('/pageviews'))!
    expect(serie).toContain(`startAt=${intervalo.desde.getTime()}`)
    expect(serie).toContain('unit=day')
    expect(serie).toContain('timezone=America%2FSantiago')
  })

  it('si Umami se reinició y olvidó el testigo, entra otra vez y repite', async () => {
    await prepararUmami(configuracion)
    umami.rechazarElPrimerTestigo = true
    const datos = await visitasDelPeriodo(configuracion, intervalo)
    expect(datos.resumen?.actual.vistas).toBe(30)
  })
})

// ------------------------------------------------------------- Cloudflare

describe('Cloudflare', () => {
  const cf = { token: 'x'.repeat(40), zona: '0123456789abcdef0123456789abcdef' }
  const ahora = new Date('2026-11-16T15:00:00Z')
  const traficoBueno = {
    data: { viewer: { zones: [{ httpRequests1dGroups: [{ dimensions: { date: '2026-11-16' }, sum: { requests: 10 } }] }] } },
  }

  it('pregunta con el token y guarda la respuesta cinco minutos', async () => {
    const fetch = vi.fn(async () => Response.json(traficoBueno))
    vi.stubGlobal('fetch', fetch)
    const primera = await traficoDeCloudflare(cf, ahora)
    expect(primera).toEqual({ ok: true, datos: { dias: [expect.objectContaining({ fecha: '2026-11-16', peticiones: 10 })], paises: [] } })
    await traficoDeCloudflare(cf, new Date(ahora.getTime() + 4 * 60_000))
    expect(fetch).toHaveBeenCalledTimes(1)
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${cf.token}`)
    await traficoDeCloudflare(cf, new Date(ahora.getTime() + 6 * 60_000))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('un token sin permiso llega como 200 con errores, y se dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: null, errors: [{ message: 'not authorized for that account' }] })))
    expect(await seguridadDeCloudflare(cf, ahora)).toEqual({ ok: false, error: 'not authorized for that account' })
  })

  it('un error no se guarda: la carga siguiente lo vuelve a intentar', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(Response.json(traficoBueno))
    vi.stubGlobal('fetch', fetch)
    expect(await traficoDeCloudflare(cf, ahora)).toEqual({ ok: false, error: expect.stringMatching(/no responde/) })
    expect((await traficoDeCloudflare(cf, ahora)).ok).toBe(true)
  })

  it('una respuesta sin la zona es un error que nombra la zona', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { viewer: { zones: [] } } })))
    expect(await traficoDeCloudflare(cf, ahora)).toEqual({ ok: false, error: expect.stringMatching(/zona/) })
  })
})

// ------------------------------------------------------- la carpeta del guion

describe('la carpeta que deja el guion', () => {
  const carpetas: string[] = []
  const carpeta = (archivos: Record<string, string>) => {
    const ruta = mkdtempSync(join(tmpdir(), 'estado-'))
    carpetas.push(ruta)
    for (const [nombre, contenido] of Object.entries(archivos)) writeFileSync(join(ruta, nombre), contenido)
    return ruta
  }
  afterAll(() => {
    for (const ruta of carpetas) rmSync(ruta, { recursive: true, force: true })
  })

  const foto = JSON.stringify({ formato: 'traumahub/estado-del-servidor', fecha: '2026-11-16T15:00:00Z', discos: [], contenedores: [] })

  it('sin la carpeta, o sin la foto, es un servidor sin el guion: no un error', async () => {
    expect(await leerElEstadoDelServidor(join(tmpdir(), 'no-existe-esta-carpeta-de-estado'))).toEqual({ tipo: 'sin-guion' })
    expect(await leerElEstadoDelServidor(carpeta({}))).toEqual({ tipo: 'sin-guion' })
  })

  it('una foto que no se entiende sí es un error, y lo dice', async () => {
    expect(await leerElEstadoDelServidor(carpeta({ 'servidor.json': '{"formato":"otro"}' }))).toEqual({
      tipo: 'ilegible',
      detalle: expect.stringMatching(/formato/),
    })
  })

  it('con la foto y sin historial, la foto sola', async () => {
    const estado = await leerElEstadoDelServidor(carpeta({ 'servidor.json': foto }))
    expect(estado).toMatchObject({ tipo: 'listo', historial: [] })
  })

  it('con las dos', async () => {
    const estado = await leerElEstadoDelServidor(
      carpeta({ 'servidor.json': foto, 'historial.csv': 'fecha,cpu,memoria,disco,carga\n2026-11-16T15:00:00Z,10,20,30,0.5\n' }),
    )
    expect(estado.tipo === 'listo' && estado.historial).toHaveLength(1)
  })
})
