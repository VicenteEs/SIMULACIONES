import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configuracionDelContador, origenSinDatos, rutaSinDatos, visitaParaUmami, VISITAS_POR_MINUTO } from '@/lib/contador'
import { ContadorDeVisitas } from '@/components/ContadorDeVisitas'
import { ESPERAS_DE_UMAMI_MS, programarUmami } from '@/lib/contadorProgramado'
import type { EstadoDeUmami } from '@/lib/visitasServidor'

/**
 * El contador de visitas (P-016 E7, D-408): qué se le pasa a Umami de cada
 * visita, y qué no.
 *
 * Umami está escondido detrás de la plataforma, y lo único que lo separa de
 * guardar un enlace de invitación, una contraseña de un solo uso o el número
 * de la cotización de alguien es la limpieza de `contador.ts` y la ruta que la
 * aplica. Lo que se fija aquí es esa limpieza, de punta a punta: una visita
 * entra por la ruta con todo lo que el navegador quiso mandar, y se mira lo
 * que sale hacia Umami.
 */

const SITIO = '6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b'
const CLAVE = 'una-clave-larga-de-prueba'

describe('la configuración', () => {
  it('solo cuenta con un sitio que sea un UUID y una clave de verdad', () => {
    expect(configuracionDelContador({})).toBeNull()
    expect(configuracionDelContador({ UMAMI_SITIO: 'traumahub', UMAMI_CLAVE: CLAVE })).toBeNull()
    expect(configuracionDelContador({ UMAMI_SITIO: SITIO, UMAMI_CLAVE: 'corta' })).toBeNull()
    expect(configuracionDelContador({ UMAMI_SITIO: SITIO.toUpperCase(), UMAMI_CLAVE: CLAVE })).toEqual({
      sitio: SITIO,
      url: 'http://umami:3000',
      usuario: 'admin',
      clave: CLAVE,
    })
    expect(configuracionDelContador({ UMAMI_SITIO: SITIO, UMAMI_CLAVE: CLAVE, UMAMI_URL: 'http://otro:4000//' })?.url).toBe(
      'http://otro:4000',
    )
  })
})

describe('la ruta que llega a Umami', () => {
  it.each([
    ['/', '/'],
    ['/modulos/cirugias?invitacion=abc#arriba', '/modulos/cirugias'],
    ['https://traumahub.cl/clave/k9Jx2-loQpz', '/clave/:testigo'],
    ['/admin-panel/cotizaciones/12', '/admin-panel/cotizaciones/:id'],
    ['/traumahub/admin-panel/usuarios/7', '/traumahub/admin-panel/usuarios/:id'],
    [`/modulos/cirugias/${SITIO}`, '/modulos/cirugias/:id'],
    ['/invitacion/a1B2c3D4e5F6g7H8i9J0k1L2m3N4', '/invitacion/:testigo'],
    // Los números fuera del panel son contenido (un año, una lección), no personas.
    ['/modulos/cirugias/2026', '/modulos/cirugias/2026'],
    // Un nombre largo de palabras con guiones no es un testigo.
    ['/modulos/fractura-de-la-diafisis-del-humero', '/modulos/fractura-de-la-diafisis-del-humero'],
  ])('%s → %s', (entra, sale) => {
    expect(rutaSinDatos(entra)).toBe(sale)
  })

  it('una ruta enorme se corta', () => {
    expect(rutaSinDatos(`/${'a'.repeat(1000)}`)!.length).toBe(400)
  })
})

describe('el origen que llega a Umami', () => {
  it('solo el sitio, y solo si es de fuera', () => {
    expect(origenSinDatos('https://www.google.com/search?q=fractura+de+fulano', 'traumahub.cl')).toBe('https://www.google.com')
    expect(origenSinDatos('https://traumahub.cl/admin-panel', 'traumahub.cl')).toBe('')
    // Otra institución, o la central vista desde una institución, es de casa.
    expect(origenSinDatos('https://hospital.traumahub.cl/', 'traumahub.cl')).toBe('')
    expect(origenSinDatos('https://traumahub.cl/', 'hospital.traumahub.cl')).toBe('')
    expect(origenSinDatos('javascript:alert(1)', 'traumahub.cl')).toBe('')
    expect(origenSinDatos(42, 'traumahub.cl')).toBe('')
  })
})

describe('la visita que se le pasa a Umami', () => {
  const visita = (payload: Record<string, unknown>, type = 'event') => ({
    type,
    payload: {
      website: 'otro-sitio',
      hostname: 'otro-dominio.cl',
      url: '/modulos?x=1',
      referrer: 'https://www.google.com/search?q=x',
      title: 'Cotización de Fulana Pérez',
      screen: '1920x1080',
      language: 'es-CL',
      id: 'fulana@hospital.cl',
      data: { rut: '11.111.111-1' },
      ip: '9.9.9.9',
      userAgent: 'inventado',
      ...payload,
    },
  })

  it('se queda solo con lo que se usa, y el sitio y el dominio los pone la plataforma', () => {
    expect(visitaParaUmami(visita({}), SITIO, 'traumahub.cl')).toEqual({
      type: 'event',
      payload: {
        website: SITIO,
        hostname: 'traumahub.cl',
        url: '/modulos',
        referrer: 'https://www.google.com',
        screen: '1920x1080',
        language: 'es-CL',
      },
    })
  })

  it('no pasan ni identify, ni los eventos con nombre, ni lo que no trae dirección', () => {
    expect(visitaParaUmami(visita({}, 'identify'), SITIO, 'traumahub.cl')).toBeNull()
    expect(visitaParaUmami(visita({ name: 'clic' }), SITIO, 'traumahub.cl')).toBeNull()
    expect(visitaParaUmami(visita({ url: 5 }), SITIO, 'traumahub.cl')).toBeNull()
    expect(visitaParaUmami('texto', SITIO, 'traumahub.cl')).toBeNull()
  })

  it('una pantalla o un idioma raros se quitan, sin perder la visita', () => {
    const limpia = visitaParaUmami(visita({ screen: '<b>', language: 'es"; drop' }), SITIO, 'traumahub.cl')!
    expect(limpia.payload).not.toHaveProperty('screen')
    expect(limpia.payload).not.toHaveProperty('language')
  })
})

describe('el guion en la página', () => {
  it('pide el guion y manda las visitas a la plataforma, sin consulta ni fragmento', () => {
    const html = renderToStaticMarkup(createElement(ContadorDeVisitas, { configuracion: { sitio: SITIO } }))
    expect(html).toContain('src="/api/visitas/guion.js"')
    expect(html).toContain('data-host-url="/api/visitas"')
    expect(html).toContain(`data-website-id="${SITIO}"`)
    expect(html).toContain('data-exclude-search="true"')
    expect(html).toContain('data-exclude-hash="true"')
    expect(html).toContain('data-do-not-track="true"')
  })
})

// ------------------------------------------------------------------ rutas

const enviadas: { url: string; init: RequestInit }[] = []
let respuestaDeUmami: () => Response | Promise<Response> = () => Response.json({ cache: 'marca' })

beforeEach(() => {
  enviadas.length = 0
  respuestaDeUmami = () => Response.json({ cache: 'marca' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      enviadas.push({ url: String(url), init })
      return respuestaDeUmami()
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const configurar = () => {
  vi.stubEnv('UMAMI_SITIO', SITIO)
  vi.stubEnv('UMAMI_CLAVE', CLAVE)
}

let ipSiguiente = 1
const peticion = (cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  new Request('https://traumahub.cl/api/visitas/api/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-host': 'traumahub.cl',
      origin: 'https://traumahub.cl',
      // Una dirección distinta por prueba: el freno es por dirección y vive en
      // la memoria del proceso, que comparten todas.
      'x-forwarded-for': `10.0.0.${ipSiguiente++}`,
      'user-agent': 'Mozilla/5.0 (Android 14) Firefox/130',
      'cf-ipcountry': 'CL',
      ...cabeceras,
    },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })

const visitaDelGuion = {
  type: 'event',
  payload: { website: SITIO, hostname: 'traumahub.cl', url: '/clave/abcdef?x=1', referrer: '', title: 'Cambiar la clave', screen: '390x844' },
}

describe('la ruta que recibe las visitas', async () => {
  const { POST } = await import('@/app/(frontend)/api/visitas/api/send/route')

  it('sin Umami en el servidor, descarta sin preguntar a nadie', async () => {
    const respuesta = await POST(peticion(visitaDelGuion))
    expect(respuesta.status).toBe(204)
    expect(enviadas).toEqual([])
  })

  it('pasa a Umami la visita limpia, con la IP de la conexión y el país de Cloudflare', async () => {
    configurar()
    const respuesta = await POST(peticion(visitaDelGuion, { 'x-umami-cache': 'firmada-por-umami' }))
    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({ cache: 'marca' })
    expect(enviadas).toHaveLength(1)
    const { url, init } = enviadas[0]
    expect(url).toBe('http://umami:3000/api/send')
    expect(JSON.parse(init.body as string)).toEqual({
      type: 'event',
      payload: { website: SITIO, hostname: 'traumahub.cl', url: '/clave/:testigo', referrer: '', screen: '390x844' },
    })
    const cabeceras = init.headers as Record<string, string>
    expect(cabeceras['x-ip-de-la-visita']).toMatch(/^10\.0\.0\.\d+$/)
    expect(cabeceras['cf-ipcountry']).toBe('CL')
    expect(cabeceras['x-umami-cache']).toBe('firmada-por-umami')
    expect(cabeceras['user-agent']).toContain('Firefox')
  })

  it('el dominio es el de la petición, no el que diga el navegador', async () => {
    configurar()
    await POST(peticion({ ...visitaDelGuion, payload: { ...visitaDelGuion.payload, hostname: 'competencia.cl' } }, {
      'x-forwarded-host': 'hospital.traumahub.cl',
      origin: 'https://hospital.traumahub.cl',
    }))
    expect(JSON.parse(enviadas[0].init.body as string).payload.hostname).toBe('hospital.traumahub.cl')
  })

  it('no acepta visitas mandadas desde otra página', async () => {
    configurar()
    expect((await POST(peticion(visitaDelGuion, { origin: 'https://otra.cl' }))).status).toBe(204)
    expect(enviadas).toEqual([])
  })

  it('un país que no son dos letras no pasa', async () => {
    configurar()
    await POST(peticion(visitaDelGuion, { 'cf-ipcountry': 'T1' }))
    expect(enviadas[0].init.headers).not.toHaveProperty('cf-ipcountry')
  })

  it('ni un cuerpo enorme, ni uno que no es JSON, ni un evento que no es visita', async () => {
    configurar()
    expect((await POST(peticion('x'.repeat(5000)))).status).toBe(204)
    expect((await POST(peticion('{roto'))).status).toBe(204)
    expect((await POST(peticion({ type: 'identify', payload: { url: '/' } }))).status).toBe(204)
    expect(enviadas).toEqual([])
  })

  it('frena a la misma dirección después de las visitas de un minuto', async () => {
    configurar()
    const ip = { 'x-forwarded-for': '10.9.9.9' }
    for (let i = 0; i < VISITAS_POR_MINUTO; i++) await POST(peticion(visitaDelGuion, ip))
    expect(enviadas).toHaveLength(VISITAS_POR_MINUTO)
    expect((await POST(peticion(visitaDelGuion, ip))).status).toBe(204)
    expect(enviadas).toHaveLength(VISITAS_POR_MINUTO)
  })

  it('si Umami falla o no responde, la página no se entera', async () => {
    configurar()
    respuestaDeUmami = () => new Response('mal', { status: 500 })
    expect((await POST(peticion(visitaDelGuion))).status).toBe(204)
    respuestaDeUmami = () => {
      throw new Error('ECONNREFUSED')
    }
    expect((await POST(peticion(visitaDelGuion))).status).toBe(204)
  })
})

describe('la ruta que sirve el guion', async () => {
  const { GET } = await import('@/app/(frontend)/api/visitas/guion.js/route')
  const LLAVE = Symbol.for('traumahub.guionDelContador')
  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[LLAVE]
  })

  it('sin Umami, no existe', async () => {
    expect((await GET()).status).toBe(404)
    expect(enviadas).toEqual([])
  })

  it('lo trae de Umami una vez y lo guarda una hora', async () => {
    configurar()
    respuestaDeUmami = () => new Response('(function(){})()')
    const primera = await GET()
    expect(await primera.text()).toBe('(function(){})()')
    expect(primera.headers.get('cache-control')).toBe('public, max-age=3600')
    await GET()
    expect(enviadas.map((e) => e.url)).toEqual(['http://umami:3000/script.js'])
  })

  it('con Umami caído, un guion vacío que no se guarda', async () => {
    configurar()
    respuestaDeUmami = () => new Response('', { status: 502 })
    const respuesta = await GET()
    expect(respuesta.status).toBe(200)
    expect(await respuesta.text()).toBe('')
    expect(respuesta.headers.get('cache-control')).toBe('no-store')
    await GET()
    expect(enviadas).toHaveLength(2)
  })
})

// ------------------------------------------------------- preparar al arrancar

describe('dejar Umami listo al arrancar', () => {
  const MARCA = Symbol.for('traumahub.umamiProgramado')
  const configuracion = { sitio: SITIO, url: 'http://umami:3000', usuario: 'admin', clave: CLAVE }

  /** Un reloj que no espera: guarda cada espera y la corre cuando se le pide. */
  function relojDePrueba() {
    const pendientes: { fn: () => void; ms: number }[] = []
    return {
      pendientes,
      reloj: { setTimeout: (fn: () => void, ms: number) => (pendientes.push({ fn, ms }), {}) },
      async avanzar() {
        const siguiente = pendientes.shift()
        siguiente?.fn()
        // Dos vueltas: la de `preparar` y la del `.catch` que la envuelve.
        await Promise.resolve()
        await Promise.resolve()
        await new Promise((r) => setTimeout(r, 0))
      },
    }
  }

  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[MARCA]
  })

  it('sin Umami configurado no programa nada', () => {
    const { reloj, pendientes } = relojDePrueba()
    expect(programarUmami({ configuracion: null, reloj })).toBe(false)
    expect(pendientes).toEqual([])
  })

  it('reintenta cada vez más espaciado hasta que queda listo, y una sola vez por proceso', async () => {
    const respuestas: EstadoDeUmami[] = [
      { estado: 'error', detalle: 'Umami no responde' },
      { estado: 'error', detalle: 'Umami no responde' },
      { estado: 'listo' },
    ]
    const preparar = vi.fn(async () => respuestas.shift()!)
    const anotar = { info: vi.fn(), error: vi.fn() }
    const { reloj, pendientes, avanzar } = relojDePrueba()
    expect(programarUmami({ configuracion, preparar, reloj, anotar })).toBe(true)
    expect(programarUmami({ configuracion, preparar, reloj, anotar })).toBe(false)

    const esperas: number[] = []
    while (pendientes.length) {
      esperas.push(pendientes[0].ms)
      await avanzar()
    }
    expect(esperas).toEqual(ESPERAS_DE_UMAMI_MS.slice(0, 3))
    expect(preparar).toHaveBeenCalledTimes(3)
    expect(anotar.info).toHaveBeenCalledWith(expect.stringContaining('Listo'))
    expect(anotar.error).not.toHaveBeenCalled()
  })

  it('después del último intento se rinde y lo deja escrito', async () => {
    const preparar = vi.fn(async (): Promise<EstadoDeUmami> => ({ estado: 'error', detalle: 'no acepta la clave' }))
    const anotar = { info: vi.fn(), error: vi.fn() }
    const { reloj, pendientes, avanzar } = relojDePrueba()
    programarUmami({ configuracion, preparar, reloj, anotar })
    while (pendientes.length) await avanzar()
    expect(preparar).toHaveBeenCalledTimes(ESPERAS_DE_UMAMI_MS.length)
    expect(anotar.error).toHaveBeenCalledWith(expect.stringContaining('no acepta la clave'))
  })
})
