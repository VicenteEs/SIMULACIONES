import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  MENSAJE_DE_OTRA_ENTRADA,
  MINUTOS_ENTRE_PAISES,
  VECES_QUE_ECHAN_A_OTRO_EQUIPO,
  datosDeLaPeticion,
  datosDelContexto,
  describirEquipo,
  minutosEnPalabras,
  motivosDeAlerta,
  nombreDelPais,
  paisDeLaPeticion,
  sesionesQueSeCierran,
  sidDelTestigo,
  sonEquiposDistintos,
  type EntradaParaRevisar,
} from '@/lib/entradas'
import { huellaDeSesion, testigoVerificado } from '@/lib/entradasServidor'

const AGENTES = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  operaWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
}

describe('el equipo en palabras', () => {
  it('reconoce los navegadores y sistemas de siempre', () => {
    expect(describirEquipo(AGENTES.chromeWindows)).toBe('Chrome en Windows')
    expect(describirEquipo(AGENTES.safariIphone)).toBe('Safari en iPhone')
    expect(describirEquipo(AGENTES.chromeAndroid)).toBe('Chrome en Android')
    expect(describirEquipo(AGENTES.firefoxLinux)).toBe('Firefox en Linux')
    expect(describirEquipo(AGENTES.safariMac)).toBe('Safari en macOS')
    expect(describirEquipo(AGENTES.chromebook)).toBe('Chrome en ChromeOS')
  })

  it('no confunde con Chrome a los que también dicen «Chrome/»', () => {
    expect(describirEquipo(AGENTES.edgeWindows)).toBe('Edge en Windows')
    expect(describirEquipo(AGENTES.operaWindows)).toBe('Opera en Windows')
    expect(describirEquipo(AGENTES.samsungAndroid)).toBe('Samsung Internet en Android')
    // Chrome en el iPhone no dice «Chrome/» sino «CriOS/», y sí dice «Version/… Safari/» a veces: no es Safari.
    expect(describirEquipo(AGENTES.chromeIphone)).toBe('Chrome en iPhone')
  })

  it('no inventa: sin agente, o con uno que no dice nada, no hay equipo', () => {
    expect(describirEquipo(null)).toBeNull()
    expect(describirEquipo('')).toBeNull()
    expect(describirEquipo('curl/8.5.0')).toBeNull()
    expect(describirEquipo('Mozilla/5.0 (Windows NT 10.0) algo/1.0')).toBe('Navegador desconocido en Windows')
  })

  it('nunca guarda el agente entero, que con la IP se parece a una huella', () => {
    const equipo = describirEquipo(AGENTES.samsungAndroid) ?? ''
    expect(equipo).not.toContain('SM-S918B')
    expect(equipo).not.toMatch(/\d/)
  })
})

describe('el país', () => {
  const con = (valor: string) => new Headers({ 'cf-ipcountry': valor })

  it('lo toma de Cloudflare, en mayúsculas', () => {
    expect(paisDeLaPeticion(con('CL'))).toBe('CL')
    expect(paisDeLaPeticion(con('pe'))).toBe('PE')
    expect(paisDeLaPeticion(con('T1'))).toBe('T1')
  })

  it('sin túnel, o cuando Cloudflare no lo sabe, no hay país', () => {
    expect(paisDeLaPeticion(new Headers())).toBeNull()
    expect(paisDeLaPeticion(con('XX'))).toBeNull()
    expect(paisDeLaPeticion(con('Chile'))).toBeNull()
    expect(paisDeLaPeticion(con('<script>'))).toBeNull()
  })

  it('se nombra en castellano para el correo', () => {
    expect(nombreDelPais('CL')).toBe('Chile')
    expect(nombreDelPais('PE')).toBe('Perú')
    expect(nombreDelPais('T1')).toBe('la red Tor')
  })
})

describe('los datos de una petición y del contexto del login', () => {
  it('junta los tres, y la IP desconocida del freno no se guarda como IP', () => {
    const cabeceras = new Headers({ 'user-agent': AGENTES.chromeWindows, 'cf-ipcountry': 'CL' })
    expect(datosDeLaPeticion(cabeceras, '190.20.1.5')).toEqual({ equipo: 'Chrome en Windows', ip: '190.20.1.5', pais: 'CL' })
    expect(datosDeLaPeticion(new Headers(), 'desconocida')).toEqual({ equipo: null, ip: null, pais: null })
  })

  it('el gancho lee lo que `entrar()` dejó, y sin eso, nada', () => {
    expect(datosDelContexto({ entrada: { equipo: 'Safari en iPhone', ip: '1.2.3.4', pais: 'CL' } })).toEqual({
      equipo: 'Safari en iPhone',
      ip: '1.2.3.4',
      pais: 'CL',
    })
    expect(datosDelContexto({})).toEqual({ equipo: null, ip: null, pais: null })
    expect(datosDelContexto(undefined)).toEqual({ equipo: null, ip: null, pais: null })
    expect(datosDelContexto({ entrada: { equipo: 3, ip: '' } })).toEqual({ equipo: null, ip: null, pais: null })
  })
})

/** Un testigo con la forma de los de Payload: HS256 sobre `payload.secret`. */
function testigo(cuerpo: Record<string, unknown>, secreto = 'secreto-de-prueba', alg = 'HS256'): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const cabecera = b64({ alg, typ: 'JWT' })
  const datos = b64(cuerpo)
  const firma = createHmac('sha256', secreto).update(`${cabecera}.${datos}`).digest('base64url')
  return `${cabecera}.${datos}.${firma}`
}

describe('el testigo', () => {
  const ahora = new Date('2026-11-16T12:00:00Z')
  const vigente = { sid: 'sesion-1', exp: Math.floor(ahora.getTime() / 1000) + 3600 }

  it('del recién firmado se lee el sid sin más', () => {
    expect(sidDelTestigo(testigo(vigente))).toBe('sesion-1')
    expect(sidDelTestigo('no-es-un-testigo')).toBeNull()
    expect(sidDelTestigo(undefined)).toBeNull()
    expect(sidDelTestigo(testigo({ exp: 1 }))).toBeNull()
  })

  it('el de una cookie solo vale si lo firmó este servidor y no ha vencido', () => {
    expect(testigoVerificado(testigo(vigente), 'secreto-de-prueba', ahora)).toBe('sesion-1')
    expect(testigoVerificado(testigo(vigente, 'otro-secreto'), 'secreto-de-prueba', ahora)).toBeNull()
    expect(testigoVerificado(testigo({ ...vigente, exp: vigente.exp - 7200 }), 'secreto-de-prueba', ahora)).toBeNull()
    expect(testigoVerificado(testigo(vigente, 'secreto-de-prueba', 'none'), 'secreto-de-prueba', ahora)).toBeNull()
    expect(testigoVerificado(undefined, 'secreto-de-prueba', ahora)).toBeNull()
    expect(testigoVerificado('a.b', 'secreto-de-prueba', ahora)).toBeNull()
  })

  it('una firma cambiada en un solo carácter no pasa', () => {
    const bueno = testigo(vigente)
    const ultimo = bueno.at(-1) === 'A' ? 'B' : 'A'
    expect(testigoVerificado(bueno.slice(0, -1) + ultimo, 'secreto-de-prueba', ahora)).toBeNull()
  })

  it('la sesión se guarda por su huella, nunca tal cual', () => {
    expect(huellaDeSesion('sesion-1')).toMatch(/^[0-9a-f]{64}$/)
    expect(huellaDeSesion('sesion-1')).not.toContain('sesion-1')
    expect(huellaDeSesion('sesion-1')).toBe(huellaDeSesion('sesion-1'))
  })
})

describe('qué sesiones quedan al entrar', () => {
  const ahora = new Date('2026-11-16T12:00:00Z')
  const enUnaHora = new Date(ahora.getTime() + 3_600_000).toISOString()
  const haceUnaHora = new Date(ahora.getTime() - 3_600_000).toISOString()

  it('solo la nueva; las que valían salen como cerradas y las vencidas se van sin más', () => {
    const r = sesionesQueSeCierran(
      [
        { id: 'vieja', expiresAt: enUnaHora },
        { id: 'vencida', expiresAt: haceUnaHora },
        { id: 'nueva', expiresAt: enUnaHora },
      ],
      'nueva',
      ahora,
    )
    expect(r.quedan.map((s) => s.id)).toEqual(['nueva'])
    expect(r.cerradas).toEqual(['vieja'])
  })

  it('si la nueva no está, no se cierra nada: dejaría fuera a quien acaba de entrar', () => {
    const sesiones = [{ id: 'vieja', expiresAt: enUnaHora }]
    expect(sesionesQueSeCierran(sesiones, 'otra', ahora)).toEqual({ quedan: sesiones, cerradas: [] })
  })
})

describe('otro equipo', () => {
  it('cuenta lo que se sabe y no lo que falta', () => {
    expect(sonEquiposDistintos({ equipo: 'Chrome en Windows', ip: '1.1.1.1' }, { equipo: 'Safari en iPhone', ip: '1.1.1.1' })).toBe(true)
    expect(sonEquiposDistintos({ equipo: 'Chrome en Windows', ip: '1.1.1.1' }, { equipo: 'Chrome en Windows', ip: '2.2.2.2' })).toBe(true)
    expect(sonEquiposDistintos({ equipo: 'Chrome en Windows', ip: '1.1.1.1' }, { equipo: 'Chrome en Windows', ip: '1.1.1.1' })).toBe(false)
    // Una sesión de antes de este cambio no tiene datos: no hace distinto a nadie.
    expect(sonEquiposDistintos({ equipo: null, ip: null }, { equipo: 'Chrome en Windows', ip: '1.1.1.1' })).toBe(false)
  })
})

describe('las entradas que no parecen de una sola persona', () => {
  const base = new Date('2026-11-16T12:00:00Z').getTime()
  const en = (minutos: number, otros: Partial<EntradaParaRevisar> = {}): EntradaParaRevisar => ({
    fecha: new Date(base + minutos * 60_000),
    pais: null,
    cerroOtroEquipo: false,
    ...otros,
  })

  it('otro país demasiado pronto', () => {
    const motivos = motivosDeAlerta(en(40, { pais: 'PE' }), [en(0, { pais: 'CL' })])
    expect(motivos).toEqual(['Entró desde Perú 40 minutos después de haber entrado desde Chile.'])
  })

  it('otro país pasado el plazo, el mismo país, o sin país, no avisa', () => {
    expect(motivosDeAlerta(en(MINUTOS_ENTRE_PAISES, { pais: 'PE' }), [en(0, { pais: 'CL' })])).toEqual([])
    expect(motivosDeAlerta(en(10, { pais: 'CL' }), [en(0, { pais: 'CL' })])).toEqual([])
    expect(motivosDeAlerta(en(10, { pais: null }), [en(0, { pais: 'CL' })])).toEqual([])
    expect(motivosDeAlerta(en(10, { pais: 'PE' }), [en(0, { pais: null })])).toEqual([])
  })

  it('cada cambio de país avisa una vez: se compara con la anterior que sabe de dónde vino', () => {
    // A las 10 ya se avisó del paso de Chile a Perú; a las 20, desde Perú otra vez, no hay nada nuevo.
    expect(motivosDeAlerta(en(20, { pais: 'PE' }), [en(0, { pais: 'CL' }), en(10, { pais: 'PE' })])).toEqual([])
    // Una entrada sin país en medio no tapa el cambio.
    expect(motivosDeAlerta(en(20, { pais: 'PE' }), [en(0, { pais: 'CL' }), en(10)])).toHaveLength(1)
  })

  it('turnarse entre equipos: tres veces en una hora echando a otro', () => {
    const anteriores = [en(0, { cerroOtroEquipo: true }), en(10, { cerroOtroEquipo: true })]
    expect(VECES_QUE_ECHAN_A_OTRO_EQUIPO).toBe(3)
    expect(motivosDeAlerta(en(20, { cerroOtroEquipo: true }), anteriores)).toEqual([
      'En la última hora se entró 3 veces con esta cuenta, y cada vez se cerró la sesión que estaba abierta en otro equipo.',
    ])
  })

  it('dos veces, o tres repartidas en más de una hora, o entradas que no echan a nadie, no avisan', () => {
    expect(motivosDeAlerta(en(10, { cerroOtroEquipo: true }), [en(0, { cerroOtroEquipo: true })])).toEqual([])
    expect(
      motivosDeAlerta(en(70, { cerroOtroEquipo: true }), [en(0, { cerroOtroEquipo: true }), en(40, { cerroOtroEquipo: true })]),
    ).toEqual([])
    expect(motivosDeAlerta(en(20), [en(0, { cerroOtroEquipo: true }), en(10, { cerroOtroEquipo: true })])).toEqual([])
  })

  it('una entrada desde el mismo equipo no repite el aviso, aunque en la hora ya fueran tres', () => {
    const tres = [en(0, { cerroOtroEquipo: true }), en(10, { cerroOtroEquipo: true }), en(20, { cerroOtroEquipo: true })]
    expect(motivosDeAlerta(en(30), tres)).toEqual([])
    expect(motivosDeAlerta(en(30, { cerroOtroEquipo: true }), tres)).toHaveLength(1)
  })

  it('las dos a la vez se dicen las dos', () => {
    const motivos = motivosDeAlerta(en(20, { pais: 'AR', cerroOtroEquipo: true }), [
      en(0, { pais: 'CL', cerroOtroEquipo: true }),
      en(10, { pais: 'CL', cerroOtroEquipo: true }),
    ])
    expect(motivos).toHaveLength(2)
    expect(motivos[0]).toContain('Argentina')
  })

  it('una entrada posterior a la que se revisa no cuenta', () => {
    expect(motivosDeAlerta(en(0, { pais: 'PE' }), [en(30, { pais: 'CL' })])).toEqual([])
  })
})

describe('el tiempo en palabras', () => {
  it('como lo diría una persona', () => {
    expect(minutosEnPalabras(0.4)).toBe('menos de un minuto')
    expect(minutosEnPalabras(1)).toBe('1 minuto')
    expect(minutosEnPalabras(40)).toBe('40 minutos')
    expect(minutosEnPalabras(60)).toBe('1 hora')
    expect(minutosEnPalabras(65)).toBe('1 hora y 5 minutos')
    expect(minutosEnPalabras(121)).toBe('2 horas y 1 minuto')
  })
})

describe('el mensaje del equipo que se quedó sin sesión', () => {
  it('dice qué pasó y que es una sola sesión, sin hablar de ataques', () => {
    expect(MENSAJE_DE_OTRA_ENTRADA).toContain('otro equipo')
    expect(MENSAJE_DE_OTRA_ENTRADA).toContain('un equipo a la vez')
    expect(MENSAJE_DE_OTRA_ENTRADA).not.toMatch(/ataque|sospech|robad/i)
  })
})
