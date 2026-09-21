import { describe, expect, it } from 'vitest'
import { Medios } from '@/collections/Medios'
import { Modelos3D } from '@/collections/Modelos3D'
import { cacheDeArchivoPrivado } from '@/collections/hooks/cacheDeArchivos'

/**
 * Un archivo subido no ejecuta nada.
 *
 * `medios` admite SVG, y un SVG abierto solo en una pestaña es un documento del
 * origen de la plataforma: sin estas cabeceras, el `<script>` que un editor
 * metiera dentro corría con la sesión de quien lo abriera. El porqué entero, en
 * `src/collections/hooks/cacheDeArchivos.ts`.
 */
describe('las cabeceras de un archivo subido', () => {
  const cabeceras = cacheDeArchivoPrivado({ headers: new Headers() })

  it('lo abren sin guiones y en un origen aparte', () => {
    const csp = cabeceras.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("script-src 'none'")
    expect(csp).toMatch(/(^|;\s*)sandbox(;|$)/)
    // Esta cabecera sustituye a la de `next.config.mjs` en estas respuestas.
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('no dejan que el navegador adivine el tipo', () => {
    expect(cabeceras.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('siguen siendo privadas: la copia de una persona no se le entrega a otra', () => {
    expect(cabeceras.get('Cache-Control')).toContain('private')
    expect(cabeceras.get('Vary')).toBe('Cookie')
  })

  it('las llevan todas las colecciones que guardan archivos', () => {
    for (const coleccion of [Medios, Modelos3D]) {
      const subida = coleccion.upload as { modifyResponseHeaders?: unknown }
      expect(subida.modifyResponseHeaders, coleccion.slug).toBe(cacheDeArchivoPrivado)
    }
  })
})
