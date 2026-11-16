import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  discoOcupado,
  fotoAtrasada,
  leerFoto,
  leerHistorial,
  memoriaOcupada,
  minutosDesde,
  promedioPorTramos,
  tiempoEncendido,
} from '@/lib/estadoDelServidor'
import {
  intervaloDe,
  leerActivos,
  leerMetricas,
  leerResumen,
  leerSerie,
  lugarDelSitio,
  nombreDelEquipo,
  nombreDelPais,
  periodoDeVisitas,
  periodoEnPalabras,
  serieCompleta,
} from '@/lib/visitas'
import {
  configuracionDeCloudflare,
  consultaDeLaSeguridad,
  consultaDelTrafico,
  contarPor,
  errorDeLaRespuesta,
  leerSeguridad,
  leerTrafico,
  nombreDeLaAccion,
  nombreDelOrigen,
  TOPE_DE_EVENTOS,
} from '@/lib/cloudflare'

/**
 * Las piezas puras de la pestaña «Monitoreo» (P-016 E7, D-408): lo que lee el
 * archivo del guion del anfitrión, las respuestas de Umami y las de Cloudflare.
 *
 * Las tres vienen de fuera de la aplicación y pueden cambiar sin avisar —el
 * guion va en el anfitrión, Umami y Cloudflare son de otros—, así que lo que
 * se fija aquí es sobre todo que una respuesta rara deja un hueco y no una
 * pestaña rota, y que un número que falta no se convierte en un cero.
 */

const ZONA = '0123456789abcdef0123456789abcdef'

const fotoCruda = (cambios: Record<string, unknown> = {}) =>
  JSON.stringify({
    formato: 'traumahub/estado-del-servidor',
    fecha: '2026-11-16T15:00:00Z',
    nucleos: 6,
    carga: [0.5, 0.4, 0.3],
    cpu: 12.5,
    encendidoSegundos: 90_000,
    memoria: { total: 12_000_000_000, disponible: 9_000_000_000 },
    intercambio: { total: 0, libre: 0 },
    discos: [{ punto: '/', total: 200_000_000_000, libre: 150_000_000_000 }],
    contenedores: [
      { nombre: 'traumahub-app', imagen: 'traumahub:local', estado: 'running', detalle: 'Up 3 hours', cpu: 1.2, memoria: 400_000_000, memoriaPct: 3.3 },
      { nombre: '', imagen: 'sin nombre', estado: 'running' },
    ],
    errorDocker: null,
    ...cambios,
  })

describe('la foto del servidor', () => {
  it('lee lo que escribe el guion', () => {
    const foto = leerFoto(fotoCruda())!
    expect(foto.fecha.toISOString()).toBe('2026-11-16T15:00:00.000Z')
    expect(foto.carga).toEqual([0.5, 0.4, 0.3])
    expect(foto.discos).toEqual([{ punto: '/', total: 200_000_000_000, libre: 150_000_000_000 }])
    // El contenedor sin nombre se descarta: sin nombre no se sabe cuál es.
    expect(foto.contenedores.map((c) => c.nombre)).toEqual(['traumahub-app'])
    expect(foto.errorDocker).toBeNull()
  })

  it('no acepta un archivo de otro formato, ni uno roto, ni uno sin fecha', () => {
    expect(leerFoto(fotoCruda({ formato: 'otra-cosa' }))).toBeNull()
    expect(leerFoto('{"formato":')).toBeNull()
    expect(leerFoto(fotoCruda({ fecha: 'ayer' }))).toBeNull()
  })

  it('un campo que falta queda en null, no en cero', () => {
    const foto = leerFoto(fotoCruda({ cpu: undefined, memoria: { total: 1 }, carga: [1, 2] }))!
    expect(foto.cpu).toBeNull()
    expect(foto.memoria).toBeNull()
    expect(foto.carga).toBeNull()
  })

  it('con los contenedores caídos, dice qué respondió docker', () => {
    expect(leerFoto(fotoCruda({ errorDocker: 'docker ps: permiso denegado', contenedores: [] }))!.errorDocker).toBe(
      'docker ps: permiso denegado',
    )
  })

  it('se da por atrasada a los tres minutos sin foto nueva', () => {
    const foto = { fecha: new Date('2026-11-16T15:00:00Z') }
    expect(minutosDesde(foto, new Date('2026-11-16T15:02:59Z'))).toBe(2)
    expect(fotoAtrasada(foto, new Date('2026-11-16T15:02:59Z'))).toBe(false)
    expect(fotoAtrasada(foto, new Date('2026-11-16T15:03:00Z'))).toBe(true)
    // Un reloj del anfitrión adelantado no da minutos negativos.
    expect(minutosDesde(foto, new Date('2026-11-16T14:00:00Z'))).toBe(0)
  })

  it('calcula lo ocupado y el tiempo encendido en palabras', () => {
    expect(memoriaOcupada({ total: 12, disponible: 9 })).toBe(25)
    expect(discoOcupado({ total: 200, libre: 150 })).toBe(25)
    expect(memoriaOcupada({ total: 0, disponible: 0 })).toBe(0)
    expect(tiempoEncendido(90_000)).toBe('1 día y 1 hora')
    expect(tiempoEncendido(3 * 86_400)).toBe('3 días')
    expect(tiempoEncendido(5 * 3_600 + 59)).toBe('5 horas')
    expect(tiempoEncendido(60)).toBe('1 minuto')
  })
})

describe('el historial', () => {
  const csv = [
    'fecha,cpu,memoria,disco,carga',
    '2026-11-16T15:01:00Z,20,50,25,0.5',
    'basura',
    '2026-11-16T15:00:00Z,10,,25,0.4',
    '2026-11-16T15:12:00Z,40,60,25,0.6',
    '',
  ].join('\n')

  it('salta las líneas que no entiende y ordena por fecha', () => {
    const muestras = leerHistorial(csv)
    expect(muestras.map((m) => m.fecha.toISOString().slice(11, 16))).toEqual(['15:00', '15:01', '15:12'])
    // La memoria vacía es un dato que falta, no un cero.
    expect(muestras[0].memoria).toBeNull()
  })

  it('promedia por tramos y deja en null los que no tienen muestra', () => {
    const tramos = promedioPorTramos(leerHistorial(csv), new Date('2026-11-16T15:00:00Z'), new Date('2026-11-16T15:30:00Z'))
    expect(tramos).toHaveLength(3)
    expect(tramos[0]).toMatchObject({ cpu: 15, memoria: 50 })
    expect(tramos[1]).toMatchObject({ cpu: 40, memoria: 60 })
    expect(tramos[2]).toMatchObject({ cpu: null, memoria: null })
  })

  it('el guion escribe las mismas columnas y el mismo formato que se leen aquí', () => {
    // El guion y la aplicación se despliegan por separado (el guion corre en
    // el anfitrión desde el clon, la aplicación desde su imagen), y un nombre
    // cambiado en uno solo dejaría la pestaña diciendo «no tiene el formato».
    const guion = readFileSync(join(process.cwd(), 'scripts', 'estado-del-servidor.sh'), 'utf8')
    expect(guion).toContain("'formato': 'traumahub/estado-del-servidor'")
    expect(guion).toContain("'fecha,cpu,memoria,disco,carga\\n'")
    for (const campo of ['nucleos', 'carga', 'cpu', 'encendidoSegundos', 'memoria', 'intercambio', 'discos', 'contenedores', 'errorDocker']) {
      expect(guion, campo).toContain(`'${campo}':`)
    }
    for (const campo of ['nombre', 'imagen', 'estado', 'detalle', 'memoriaPct', 'disponible', 'libre', 'punto']) {
      expect(guion, campo).toContain(`'${campo}'`)
    }
  })
})

describe('las visitas de Umami', () => {
  it('el periodo sale de la dirección, y uno desconocido es el de siempre', () => {
    expect(periodoDeVisitas('30d')).toBe('30d')
    expect(periodoDeVisitas(['24h', '7d'])).toBe('24h')
    expect(periodoDeVisitas('1año')).toBe('7d')
    expect(periodoDeVisitas(undefined)).toBe('7d')
    expect(periodoEnPalabras('24h')).toBe('las últimas 24 horas')
    expect(periodoEnPalabras('30d')).toBe('los últimos 30 días')
    const ahora = new Date('2026-11-16T15:20:00Z')
    expect(intervaloDe('24h', ahora)).toEqual({ desde: new Date('2026-11-15T16:00:00Z'), hasta: ahora, unidad: 'hour' })
    // Siete días del calendario de Chile, el de hoy incluido: desde la
    // medianoche del 10, que en noviembre es a las 03:00 universales.
    expect(intervaloDe('7d', ahora)).toEqual({ desde: new Date('2026-11-10T03:00:00Z'), hasta: ahora, unidad: 'day' })
    expect(intervaloDe('30d', ahora).desde).toEqual(new Date('2026-10-18T03:00:00Z'))
  })

  it('el periodo pinta tantas barras como dice su nombre', () => {
    const ahora = new Date('2026-11-16T15:20:00Z')
    for (const [periodo, puntos] of [['24h', 24], ['7d', 7], ['30d', 30]] as const) {
      const { desde, hasta, unidad } = intervaloDe(periodo, ahora)
      expect(serieCompleta(new Map(), desde, hasta, unidad), periodo).toHaveLength(puntos)
    }
  })

  it('la medianoche sale bien también con el horario de invierno y en el día del cambio', () => {
    // Chile vuelve al horario de invierno (UTC-4) el primer domingo de abril.
    expect(intervaloDe('7d', new Date('2026-06-20T12:00:00Z')).desde).toEqual(new Date('2026-06-14T04:00:00Z'))
    // La noche del 4 al 5 de abril de 2026 se atrasa la hora: la medianoche
    // del 5 ya es de invierno.
    expect(intervaloDe('7d', new Date('2026-04-11T12:00:00Z')).desde).toEqual(new Date('2026-04-05T04:00:00Z'))
    // La del 5 al 6 de septiembre se adelanta: el 6 no tiene medianoche y
    // empieza a la 01:00 de verano, que son las mismas 04:00 universales.
    expect(intervaloDe('7d', new Date('2026-09-12T12:00:00Z')).desde).toEqual(new Date('2026-09-06T04:00:00Z'))
    expect(serieCompleta(new Map(), ...Object.values(intervaloDe('7d', new Date('2026-09-12T12:00:00Z'))) as [Date, Date, 'day'])).toHaveLength(7)
    // A la media hora del sábado 12 de septiembre, 144 horas atrás aún era el 5.
    expect(intervaloDe('7d', new Date('2026-09-12T03:30:00Z')).desde).toEqual(new Date('2026-09-06T04:00:00Z'))
  })

  it('lee el resumen de Umami 3, con su comparación aparte', () => {
    const resumen = leerResumen({
      pageviews: 120,
      visitors: 40,
      visits: 50,
      bounces: 20,
      totaltime: 3000,
      comparison: { pageviews: 100, visitors: 30, visits: 45, bounces: 10, totaltime: 2000 },
    })
    expect(resumen).toEqual({
      actual: { vistas: 120, visitantes: 40, visitas: 50, rebotes: 20, tiempoTotal: 3000 },
      anterior: { vistas: 100, visitantes: 30, visitas: 45, rebotes: 10, tiempoTotal: 2000 },
    })
  })

  it('y el de Umami 2, con { value, prev } en cada cifra', () => {
    const resumen = leerResumen({
      pageviews: { value: 120, prev: 100 },
      visitors: { value: 40, prev: 30 },
      visits: { value: 50, prev: 45 },
      bounces: { value: 20, prev: 10 },
      totaltime: { value: 3000, prev: 2000 },
    })
    expect(resumen?.actual.vistas).toBe(120)
    expect(resumen?.anterior?.vistas).toBe(100)
  })

  it('un resumen sin las cifras principales es null, no ceros', () => {
    expect(leerResumen({ visits: 3 })).toBeNull()
    expect(leerResumen('error')).toBeNull()
    expect(leerResumen({ pageviews: 3, visitors: 2 })?.anterior).toBeNull()
  })

  it('lee las métricas de mayor a menor y salta las filas raras', () => {
    expect(leerMetricas([{ x: '/a', y: 2 }, { x: null, y: 5 }, { x: '/b', y: 'tres' }, 7])).toEqual([
      { etiqueta: '', valor: 5 },
      { etiqueta: '/a', valor: 2 },
    ])
    expect(leerMetricas({ error: 'x' })).toEqual([])
  })

  it('la serie se suma por hora, venga la fecha con espacio o con T', () => {
    const serie = leerSerie(
      { pageviews: [{ x: '2026-11-16 09:00:00', y: 3 }, { x: '2026-11-16T09:30:00Z', y: 2 }, { x: '2026-11-16 10:00:00', y: 1 }] },
      'pageviews',
    )
    expect([...serie]).toEqual([
      ['2026-11-16 09', 5],
      ['2026-11-16 10', 1],
    ])
  })

  it('la serie completa trae también los días sin visitas, en la hora de Chile', () => {
    const serie = new Map([['2026-11-14', 4]])
    const puntos = serieCompleta(serie, new Date('2026-11-12T15:00:00Z'), new Date('2026-11-16T15:00:00Z'), 'day')
    expect(puntos.map((p) => p.valor)).toEqual([0, 0, 4, 0, 0])
    expect(puntos[2].etiqueta).toMatch(/14/)
    const horas = serieCompleta(new Map(), new Date('2026-11-15T15:00:00Z'), new Date('2026-11-16T14:30:00Z'), 'hour')
    expect(horas).toHaveLength(24)
    expect(horas[0].etiqueta).toBe('12:00')
  })

  it('los activos llegan de tres formas', () => {
    expect(leerActivos({ visitors: 3 })).toBe(3)
    expect(leerActivos([{ x: 2 }])).toBe(2)
    expect(leerActivos(5)).toBe(5)
    expect(leerActivos({ nada: 1 })).toBeNull()
  })

  it('nombra los lugares, los países y los equipos', () => {
    expect(lugarDelSitio('traumahub.cl', 'traumahub.cl')).toBe('TraumaHub')
    expect(lugarDelSitio('www.traumahub.cl', 'traumahub.cl')).toBe('TraumaHub')
    expect(lugarDelSitio('hospital.traumahub.cl', 'traumahub.cl')).toBe('hospital')
    expect(lugarDelSitio('otro.cl', 'traumahub.cl')).toBe('otro.cl')
    expect(nombreDelPais('CL')).toBe('Chile')
    expect(nombreDelPais('')).toBe('Desconocido')
    expect(nombreDelPais('XX9')).toBe('XX9')
    expect(nombreDelEquipo('mobile')).toBe('Teléfono')
    expect(nombreDelEquipo('')).toBe('Desconocido')
  })
})

describe('Cloudflare', () => {
  it('solo se configura con un token de verdad y una zona de 32 hexadecimales', () => {
    expect(configuracionDeCloudflare({})).toBeNull()
    expect(configuracionDeCloudflare({ CLOUDFLARE_TOKEN: 'corto', CLOUDFLARE_ZONA: ZONA })).toBeNull()
    expect(configuracionDeCloudflare({ CLOUDFLARE_TOKEN: 'x'.repeat(40), CLOUDFLARE_ZONA: 'traumahub.cl' })).toBeNull()
    expect(configuracionDeCloudflare({ CLOUDFLARE_TOKEN: ` ${'x'.repeat(40)} `, CLOUDFLARE_ZONA: ZONA.toUpperCase() })).toEqual({
      token: 'x'.repeat(40),
      zona: ZONA,
    })
  })

  it('las consultas no piden la IP, la red ni el navegador de nadie', () => {
    const ahora = new Date('2026-11-16T15:00:00Z')
    const seguridad = consultaDeLaSeguridad(ZONA, ahora)
    for (const campo of ['clientIP', 'clientAsn', 'userAgent', 'clientIPClass', 'rayName']) {
      expect(seguridad).not.toContain(campo)
    }
    expect(seguridad).toContain('datetime_geq: "2026-11-09T15:00:00Z"')
    expect(consultaDelTrafico(ZONA, ahora)).toContain('date_geq: "2026-10-18"')
  })

  it('una zona que no es de 32 hexadecimales no entra en la consulta', () => {
    // Va escrita dentro del texto de la consulta: validarla es lo que impide
    // que alguien con acceso al .env meta otra cosa en ella.
    expect(() => consultaDelTrafico('"}){ viewer', new Date())).toThrow()
    expect(() => consultaDeLaSeguridad('abc', new Date())).toThrow()
  })

  it('lee el tráfico por día y suma los países', () => {
    const trafico = leerTrafico({
      data: {
        viewer: {
          zones: [
            {
              httpRequests1dGroups: [
                {
                  dimensions: { date: '2026-11-16' },
                  sum: { requests: 10, cachedRequests: 4, bytes: 1000, threats: 1, pageViews: 3, countryMap: [{ clientCountryName: 'CL', requests: 8, threats: 0 }] },
                  uniq: { uniques: 2 },
                },
                {
                  dimensions: { date: '2026-11-15' },
                  sum: { requests: 5, countryMap: [{ clientCountryName: 'CL', requests: 3 }, { clientCountryName: 'US', requests: 2, threats: 1 }] },
                },
                { dimensions: {}, sum: { requests: 99 } },
              ],
            },
          ],
        },
      },
    })!
    expect(trafico.dias.map((d) => [d.fecha, d.peticiones, d.enCache])).toEqual([
      ['2026-11-15', 5, 0],
      ['2026-11-16', 10, 4],
    ])
    expect(trafico.paises).toEqual([
      { pais: 'CL', peticiones: 11, amenazas: 0 },
      { pais: 'US', peticiones: 2, amenazas: 1 },
    ])
    expect(leerTrafico({ data: { viewer: { zones: [] } } })).toBeNull()
  })

  it('lee los eventos de seguridad y avisa si llegó al tope', () => {
    const evento = { action: 'block', source: 'waf', clientCountryName: 'RU', clientRequestPath: '/wp-login.php', datetime: '2026-11-16T10:00:00Z' }
    const pocos = leerSeguridad({ data: { viewer: { zones: [{ firewallEventsAdaptive: [evento, { datetime: 'nunca' }] }] } } })!
    expect(pocos.eventos).toHaveLength(1)
    expect(pocos.eventos[0]).toMatchObject({ accion: 'block', origen: 'waf', pais: 'RU', ruta: '/wp-login.php' })
    expect(pocos.tope).toBe(false)
    const muchos = leerSeguridad({ data: { viewer: { zones: [{ firewallEventsAdaptive: Array(TOPE_DE_EVENTOS).fill(evento) }] } } })!
    expect(muchos.tope).toBe(true)
  })

  it('cuenta los eventos y los nombra en español', () => {
    expect(contarPor(['a', 'b', 'a'], (x) => x)).toEqual([
      { etiqueta: 'a', valor: 2 },
      { etiqueta: 'b', valor: 1 },
    ])
    expect(nombreDeLaAccion('managed_challenge')).toBe('Desafío gestionado')
    expect(nombreDeLaAccion('nueva')).toBe('nueva')
    expect(nombreDelOrigen('firewallManaged')).toBe('Reglas administradas de Cloudflare')
    expect(nombreDelOrigen('')).toBe('Sin origen')
  })

  it('reconoce el error de GraphQL aunque llegue con un 200', () => {
    expect(errorDeLaRespuesta({ errors: [{ message: 'not authorized' }, {}] })).toBe('not authorized · error sin mensaje')
    expect(errorDeLaRespuesta({ data: {} })).toBeNull()
    expect(errorDeLaRespuesta(null)).toMatch(/no es JSON/)
  })
})
