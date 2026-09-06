import { describe, it, expect } from 'vitest'
import { origenDe, ruta } from '@/lib/rutas'

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
