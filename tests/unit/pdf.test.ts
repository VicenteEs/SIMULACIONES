import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  esIdDeFicha,
  esPaginaConPdf,
  leerCookies,
  destinoDePeticion,
  nombreDelPdf,
  origenDe,
  origenInterno,
} from '@/lib/pdf'

const fuente = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8')

describe('qué se puede pedir en PDF', () => {
  it('solo las tres páginas de ficha, y no un camino cualquiera', () => {
    for (const pagina of ['biblioteca', 'imagenes', 'tecnica-ao']) expect(esPaginaConPdf(pagina)).toBe(true)
    for (const pagina of ['admin-panel', '../admin-panel', 'biblioteca/../admin-panel', '', 'simulador']) {
      expect(esPaginaConPdf(pagina), pagina).toBe(false)
    }
  })

  it('el id es un entero positivo y nada más', () => {
    expect(esIdDeFicha('12')).toBe(true)
    for (const id of ['0', '-1', '1.5', '12a', '', '1/../2', '12345678901']) expect(esIdDeFicha(id), id).toBe(false)
  })
})

describe('el origen interno', () => {
  it('sale del puerto donde escucha el servidor, en 127.0.0.1', () => {
    expect(origenInterno('3100')).toBe('http://127.0.0.1:3100')
  })

  it('sin puerto, o con algo que no es un puerto, usa el de siempre', () => {
    expect(origenInterno(undefined)).toBe('http://127.0.0.1:3000')
    expect(origenInterno('3000@otra.maquina')).toBe('http://127.0.0.1:3000')
  })
})

describe('lo que la página puede pedir mientras se imprime', () => {
  const origenes = { interno: 'http://127.0.0.1:3000', publico: 'https://ved.tailc2094f.ts.net:10000' }
  const prefijo = '/traumahub'
  const destino = (direccion: string, metodo = 'GET', tipo = 'document') =>
    destinoDePeticion({ direccion, metodo, tipo }, origenes, prefijo)

  it('las lecturas de la propia plataforma siguen', () => {
    expect(destino('http://127.0.0.1:3000/traumahub/biblioteca/3')).toBe('seguir')
    expect(destino('http://127.0.0.1:3000/traumahub/_next/static/x.css', 'GET', 'stylesheet')).toBe('seguir')
    expect(destino('data:image/png;base64,AAAA', 'GET', 'image')).toBe('seguir')
  })

  it('las acciones de servidor se cortan: la visita y el latido escribirían actividad falsa', () => {
    expect(destino('http://127.0.0.1:3000/traumahub/biblioteca/3', 'POST', 'fetch')).toBe('cortar')
  })

  it('el aviso de cambios y el vídeo se cortan: uno no se cierra nunca y el otro no sale en papel', () => {
    expect(destino('http://127.0.0.1:3000/traumahub/api/cambios', 'GET', 'eventsource')).toBe('cortar')
    expect(destino('http://127.0.0.1:3000/traumahub/api/cambios')).toBe('cortar')
    expect(destino('http://127.0.0.1:3000/traumahub/api/medios/file/a.mp4', 'GET', 'media')).toBe('cortar')
  })

  it('la imagen de un archivo subido, escrita con la dirección pública, se trae por dentro', () => {
    expect(destino('https://ved.tailc2094f.ts.net:10000/traumahub/api/medios/file/a.jpg', 'GET', 'image')).toBe('traer')
    // De la dirección pública solo las imágenes: el modelo 3D no sale en papel.
    expect(destino('https://ved.tailc2094f.ts.net:10000/traumahub/api/modelos-3d/file/a.glb', 'GET', 'fetch')).toBe('cortar')
  })

  it('nada de otro origen sale con la sesión de nadie', () => {
    expect(destino('https://ejemplo.org/x.png', 'GET', 'image')).toBe('cortar')
    expect(destino('http://127.0.0.1:5432/')).toBe('cortar')
    expect(destino('no es una dirección')).toBe('cortar')
    expect(destinoDePeticion({ direccion: 'https://ejemplo.org/x.png', metodo: 'GET', tipo: 'image' }, { ...origenes, publico: null }, prefijo)).toBe('cortar')
  })

  it('el origen se saca sin la ruta, como lo compara el navegador', () => {
    expect(origenDe('https://traumahub.tailc2094f.ts.net/simulaciones')).toBe('https://traumahub.tailc2094f.ts.net')
    expect(origenDe('')).toBeNull()
    expect(origenDe('no es una dirección')).toBeNull()
  })
})

describe('las cookies que se pasan al navegador', () => {
  it('se leen todas, con el valor tal como llegó', () => {
    expect(leerCookies('traumahub-token=abc.def%3D; vista=residente')).toEqual([
      { name: 'traumahub-token', value: 'abc.def%3D' },
      { name: 'vista', value: 'residente' },
    ])
  })

  it('sin cabecera o con trozos sin nombre, nada', () => {
    expect(leerCookies(null)).toEqual([])
    expect(leerCookies('; =x; suelto')).toEqual([])
  })
})

describe('el nombre del archivo', () => {
  it('sale del título, sin tildes ni signos', () => {
    expect(nombreDelPdf('Fractura de la meseta tibial · Schatzker V–VI', 'biblioteca', '4')).toBe(
      'traumahub-fractura-de-la-meseta-tibial-schatzker-v-vi.pdf',
    )
    expect(nombreDelPdf('Lesión del ligamento cruzado', 'biblioteca', '4')).toBe('traumahub-lesion-del-ligamento-cruzado.pdf')
  })

  it('sin título usa la página y el número', () => {
    expect(nombreDelPdf(null, 'tecnica-ao', '9')).toBe('traumahub-tecnica-ao-9.pdf')
    expect(nombreDelPdf('—', 'imagenes', '2')).toBe('traumahub-imagenes-2.pdf')
  })

  it('no pasa de un largo razonable ni acaba en guion', () => {
    const nombre = nombreDelPdf('a'.repeat(79) + ' bcd', 'biblioteca', '1')
    expect(nombre.length).toBeLessThanOrEqual('traumahub-.pdf'.length + 80)
    expect(nombre).not.toMatch(/-\.pdf$/)
  })
})

describe('el botón', () => {
  const boton = fuente('src', 'components', 'BotonImprimir.tsx')

  it('descarga el PDF del servidor y no abre el diálogo de impresión', () => {
    // El comentario cuenta que antes lo llamaba; lo que no puede haber es la llamada.
    expect(boton).not.toMatch(/=>\s*window\.print\(/)
    // Por `ruta()`: sin el prefijo, en el servidor la petición la atendería
    // otra página del mismo dominio.
    expect(boton).toMatch(/ruta\(`\/api\/pdf\//)
  })

  it('la ruta comprueba la sesión antes de abrir el navegador', () => {
    const ruta = fuente('src', 'app', '(frontend)', 'api', 'pdf', '[pagina]', '[id]', 'route.ts')
    expect(ruta.indexOf('payload.auth(')).toBeGreaterThan(0)
    expect(ruta.indexOf('payload.auth(')).toBeLessThan(ruta.indexOf('imprimirFicha('))
  })
})
