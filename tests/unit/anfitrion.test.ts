import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import {
  CABECERA_DEL_SUBDOMINIO,
  COOKIE_DE_LA_INSTITUCION_DE_PRUEBA,
  direccionDeLaInstitucion,
  dominioDeInstituciones,
  normalizarSubdominioPedido,
  OrigenesDeConfianza,
  subdominioDeLaPeticion,
  subdominioDelAnfitrion,
} from '@/lib/anfitrion'
import { cuentaValeEnElLugar } from '@/access/reglas'
import { sinOrigen } from '@/collections/hooks/direccionSinPrefijo'

/**
 * De qué institución es cada petición, según su anfitrión (P-016 E5.2, D-396).
 *
 * Lo que se cuida: que la central siga siendo la central en todas sus formas
 * (el dominio, `www`, la IP, el nombre de ved), que la cookie del selector
 * solo mande en el servidor de pruebas, y que lo que manda el navegador en la
 * cabecera no sirva para hacerse pasar por otra institución.
 */

describe('el dominio de las instituciones', () => {
  it('es la variable si está, y si no el servidor de la dirección pública', () => {
    expect(dominioDeInstituciones(' .TraumaHub.cl. ', 'https://otra.cl')).toBe('traumahub.cl')
    expect(dominioDeInstituciones(undefined, 'https://traumahub.cl/traumahub')).toBe('traumahub.cl')
    expect(dominioDeInstituciones('', 'http://localhost:3000')).toBe('localhost')
    expect(dominioDeInstituciones(undefined, undefined)).toBe('')
    expect(dominioDeInstituciones(undefined, 'no es una dirección')).toBe('')
  })
})

describe('el subdominio de un anfitrión', () => {
  const dominio = 'traumahub.cl'

  it('saca el de la institución, sin puerto ni mayúsculas', () => {
    expect(subdominioDelAnfitrion('uchile.traumahub.cl', dominio)).toBe('uchile')
    expect(subdominioDelAnfitrion('UChile.TraumaHub.cl:443', dominio)).toBe('uchile')
  })

  it('la central en todas sus formas', () => {
    for (const anfitrion of ['traumahub.cl', 'www.traumahub.cl', '195.26.240.163:10000', 'ved.tail1234.ts.net', '[::1]:3000', '', null, undefined]) {
      expect(subdominioDelAnfitrion(anfitrion, dominio), String(anfitrion)).toBe('')
    }
  })

  it('un nombre que solo termina igual no es del dominio', () => {
    expect(subdominioDelAnfitrion('mitraumahub.cl', dominio)).toBe('')
  })

  it('dos niveles salen enteros, y no habrá institución que se llame así', () => {
    expect(subdominioDelAnfitrion('a.b.traumahub.cl', dominio)).toBe('a.b')
  })

  it('`localhost` vale siempre, para el PDF y para desarrollo', () => {
    expect(subdominioDelAnfitrion('uchile.localhost:3000', dominio)).toBe('uchile')
    expect(subdominioDelAnfitrion('localhost:3000', dominio)).toBe('')
  })
})

describe('el subdominio de la petición', () => {
  const dominio = 'traumahub.cl'

  it('la cookie del selector solo manda en el servidor de pruebas', () => {
    expect(subdominioDeLaPeticion({ anfitrion: 'traumahub.cl', dominio, enPruebas: false, cookieDePrueba: 'uchile' })).toBe('')
    expect(subdominioDeLaPeticion({ anfitrion: 'ved.ts.net', dominio, enPruebas: true, cookieDePrueba: ' UChile ' })).toBe('uchile')
  })

  it('y no le gana al anfitrión', () => {
    expect(subdominioDeLaPeticion({ anfitrion: 'puc.traumahub.cl', dominio, enPruebas: true, cookieDePrueba: 'uchile' })).toBe('puc')
  })

  it('una cookie que no parece un subdominio es la central', () => {
    for (const cookie of ['a.b', "x' OR 1=1", 'á', 'a'.repeat(64), '']) {
      expect(subdominioDeLaPeticion({ anfitrion: 'ved.ts.net', dominio, enPruebas: true, cookieDePrueba: cookie }), cookie).toBe('')
    }
    expect(normalizarSubdominioPedido(42)).toBe('')
  })
})

describe('el proxy', () => {
  const pasar = async (anfitrion: string, cabeceras: Record<string, string> = {}) => {
    const { proxy } = await import('@/proxy')
    const respuesta = proxy(new NextRequest(`https://${anfitrion}/biblioteca`, { headers: { host: anfitrion, ...cabeceras } }))
    // `NextResponse.next({ request: { headers } })` deja las cabeceras de la
    // petición en estas, que Next aplica antes de seguir.
    return respuesta.headers.get(`x-middleware-request-${CABECERA_DEL_SUBDOMINIO}`)
  }

  it('escribe el subdominio del anfitrión', async () => {
    process.env.DOMINIO_DE_INSTITUCIONES = 'traumahub.cl'
    try {
      expect(await pasar('uchile.traumahub.cl')).toBe('uchile')
      expect(await pasar('traumahub.cl')).toBe('')
    } finally {
      delete process.env.DOMINIO_DE_INSTITUCIONES
    }
  })

  it('pisa la cabecera que mande el navegador', async () => {
    process.env.DOMINIO_DE_INSTITUCIONES = 'traumahub.cl'
    try {
      expect(await pasar('traumahub.cl', { [CABECERA_DEL_SUBDOMINIO]: 'uchile' })).toBe('')
      expect(await pasar('puc.traumahub.cl', { [CABECERA_DEL_SUBDOMINIO]: 'uchile' })).toBe('puc')
    } finally {
      delete process.env.DOMINIO_DE_INSTITUCIONES
    }
  })

  it('fuera del servidor de pruebas no mira la cookie del selector', async () => {
    process.env.DOMINIO_DE_INSTITUCIONES = 'traumahub.cl'
    const antes = process.env.SERVIDOR_DE_PRUEBAS
    try {
      delete process.env.SERVIDOR_DE_PRUEBAS
      expect(await pasar('traumahub.cl', { cookie: `${COOKIE_DE_LA_INSTITUCION_DE_PRUEBA}=uchile` })).toBe('')
      process.env.SERVIDOR_DE_PRUEBAS = 'https://traumahub.cl'
      expect(await pasar('traumahub.cl', { cookie: `${COOKIE_DE_LA_INSTITUCION_DE_PRUEBA}=uchile` })).toBe('uchile')
    } finally {
      delete process.env.DOMINIO_DE_INSTITUCIONES
      if (antes === undefined) delete process.env.SERVIDOR_DE_PRUEBAS
      else process.env.SERVIDOR_DE_PRUEBAS = antes
    }
  })
})

describe('una cuenta vale solo en su lugar', () => {
  it('la de una institución en la suya, y la central en la central', () => {
    expect(cuentaValeEnElLugar('3', '3')).toBe(true)
    expect(cuentaValeEnElLugar(null, null)).toBe(true)
    expect(cuentaValeEnElLugar('3', '4')).toBe(false)
    expect(cuentaValeEnElLugar('3', null)).toBe(false)
    expect(cuentaValeEnElLugar(null, '3')).toBe(false)
  })
})

describe('la dirección de una institución, para los correos', () => {
  it('pone el subdominio delante y conserva el prefijo', () => {
    expect(direccionDeLaInstitucion('uchile', 'https://traumahub.cl')).toBe('https://uchile.traumahub.cl')
    expect(direccionDeLaInstitucion('uchile', 'https://www.traumahub.cl/traumahub')).toBe('https://uchile.traumahub.cl/traumahub')
    expect(direccionDeLaInstitucion('uchile', 'http://localhost:3000')).toBe('http://uchile.localhost:3000')
  })

  it('sin subdominio, o con una dirección rara, la central tal cual', () => {
    expect(direccionDeLaInstitucion('', 'https://traumahub.cl/x')).toBe('https://traumahub.cl/x')
    expect(direccionDeLaInstitucion('uchile', '')).toBe('')
  })
})

describe('los orígenes de confianza de Payload (csrf)', () => {
  const lista = () => {
    const origenes = new OrigenesDeConfianza('https://traumahub.cl', 'traumahub.cl')
    // Lo que hace Payload al sanear la configuración.
    origenes.push('https://traumahub.cl')
    return origenes
  }

  it('acepta la central y cualquier subdominio de un nivel, con el mismo esquema y puerto', () => {
    expect(lista().includes('https://traumahub.cl')).toBe(true)
    expect(lista().includes('https://uchile.traumahub.cl')).toBe(true)
  })

  it('y nada más', () => {
    for (const origen of [
      'http://uchile.traumahub.cl',
      'https://uchile.traumahub.cl:8443',
      'https://a.b.traumahub.cl',
      'https://uchile.traumahub.cl/ruta',
      'https://mitraumahub.cl',
      'https://traumahub.cl.otro.cl',
      'null',
      '',
    ]) {
      expect(lista().includes(origen), origen).toBe(false)
    }
  })

  it('sin dominio, solo lo que tiene escrito', () => {
    const origenes = new OrigenesDeConfianza('https://traumahub.cl', '')
    origenes.push('https://traumahub.cl')
    expect(origenes.includes('https://traumahub.cl')).toBe(true)
    expect(origenes.includes('https://uchile.traumahub.cl')).toBe(false)
  })

  it('sigue siendo un arreglo para quien lo recorra', () => {
    const copia = lista().map((o) => o.toUpperCase())
    expect(copia).toEqual(['HTTPS://TRAUMAHUB.CL'])
    expect(copia).not.toBeInstanceOf(OrigenesDeConfianza)
    expect(lista().length).toBe(1)
  })
})

describe('la dirección de un archivo, al leerla', () => {
  it('pierde el origen de la dirección pública y conserva el prefijo', () => {
    const origen = 'https://traumahub.cl'
    expect(sinOrigen('https://traumahub.cl/traumahub/api/medios/file/a.png', origen)).toBe('/traumahub/api/medios/file/a.png')
    expect(sinOrigen('/api/medios/file/a.png', origen)).toBe('/api/medios/file/a.png')
  })

  it('lo de otro origen no se toca', () => {
    expect(sinOrigen('https://otro.cl/a.png', 'https://traumahub.cl')).toBe('https://otro.cl/a.png')
    expect(sinOrigen('https://traumahub.cl.otro.cl/a.png', 'https://traumahub.cl')).toBe('https://traumahub.cl.otro.cl/a.png')
    expect(sinOrigen('https://traumahub.cl/a.png', null)).toBe('https://traumahub.cl/a.png')
  })
})
