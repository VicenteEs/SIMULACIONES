import { describe, it, expect } from 'vitest'
import { origenDe, ruta, sinPrefijo } from '@/lib/rutas'

/**
 * El prefijo bajo el que vive la plataforma cuando comparte servidor con otras
 * páginas. Dos funciones pequeñas de las que depende que la sesión funcione.
 */

describe('rutas con prefijo', () => {
  it('sin prefijo devuelve el camino tal cual', () => {
    // En desarrollo la aplicación va en la raíz y NEXT_PUBLIC_BASE_PATH no
    // está definida, que es como corren estas pruebas.
    expect(ruta('/api/salud')).toBe('/api/salud')
    expect(ruta('/logo.png')).toBe('/logo.png')
  })

  it('deja en paz lo que no es una ruta absoluta', () => {
    expect(ruta('https://ejemplo.cl/x.png')).toBe('https://ejemplo.cl/x.png')
    expect(ruta('relativo.png')).toBe('relativo.png')
  })
})

describe('el camino sin prefijo, que es lo que se guarda (D-370)', () => {
  it('quita el prefijo una vez', () => {
    expect(sinPrefijo('/traumahub/biblioteca/3', '/traumahub')).toBe('/biblioteca/3')
    expect(sinPrefijo('/traumahub/api/medios/file/a.png', '/traumahub')).toBe('/api/medios/file/a.png')
    // El prefijo dos veces es el error de O-019. Se quita uno y el otro se deja
    // a la vista, sin taparlo.
    expect(sinPrefijo('/traumahub/traumahub/x', '/traumahub')).toBe('/traumahub/x')
  })

  it('la portada, con o sin barra final, queda en la raíz', () => {
    expect(sinPrefijo('/traumahub', '/traumahub')).toBe('/')
    expect(sinPrefijo('/traumahub/', '/traumahub')).toBe('/')
    expect(sinPrefijo('/traumahub/', '/traumahub/')).toBe('/')
  })

  it('no corta un tramo que solo empieza igual', () => {
    // `/traumahubx` no es la plataforma bajo `/traumahub`: cortarlo dejaría
    // una ruta inventada, `x/…`.
    expect(sinPrefijo('/traumahubx/biblioteca', '/traumahub')).toBe('/traumahubx/biblioteca')
  })

  it('sin prefijo, o con un camino que no lo trae, no cambia nada', () => {
    expect(sinPrefijo('/biblioteca/3', '')).toBe('/biblioteca/3')
    expect(sinPrefijo('/biblioteca/3', '/traumahub')).toBe('/biblioteca/3')
    expect(sinPrefijo('/api/medios/file/a.png', '/traumahub')).toBe('/api/medios/file/a.png')
    expect(sinPrefijo('https://ejemplo.cl/traumahub/x', '/traumahub')).toBe('https://ejemplo.cl/traumahub/x')
  })

  it('es la inversa de ruta()', () => {
    // Estas pruebas corren sin prefijo (ver arriba), así que se comprueba con
    // el de omisión, que es el de la instalación.
    for (const camino of ['/', '/biblioteca/3', '/api/salud']) expect(sinPrefijo(ruta(camino))).toBe(camino)
  })
})

describe('origen de una dirección', () => {
  /**
   * Payload compara `serverURL` con la cabecera `Origin`, que nunca lleva
   * ruta. Dejarle el prefijo hacía que descartara la cookie de sesión en toda
   * petición con esa cabecera: las páginas abrían y las acciones respondían
   * «acceso denegado» (O-018).
   */
  it('quita la ruta y conserva el puerto', () => {
    expect(origenDe('https://ved.tailc2094f.ts.net:10000/traumahub')).toBe(
      'https://ved.tailc2094f.ts.net:10000',
    )
    expect(origenDe('https://ved.tailc2094f.ts.net:10000/traumahub/')).toBe(
      'https://ved.tailc2094f.ts.net:10000',
    )
  })

  it('una dirección que ya es un origen no cambia', () => {
    expect(origenDe('http://localhost:3000')).toBe('http://localhost:3000')
    expect(origenDe('https://plataforma.cl')).toBe('https://plataforma.cl')
  })

  it('coincide con lo que un navegador manda en Origin', () => {
    // Es la comparación exacta que hace Payload; si esto falla, la sesión se
    // pierde en cada acción de servidor.
    const direccion = 'https://ved.tailc2094f.ts.net:10000/traumahub'
    const loQueMandaElNavegador = new URL(direccion).origin
    expect(origenDe(direccion)).toBe(loQueMandaElNavegador)
  })

  it('devuelve tal cual lo que no se puede analizar, en vez de vaciarlo', () => {
    expect(origenDe('')).toBe('')
    expect(origenDe('no-es-una-direccion')).toBe('no-es-una-direccion')
  })
})
