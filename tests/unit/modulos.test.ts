import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { MODULOS, NOMBRE_DE_MODULO, rutaPublica } from '@/app/(frontend)/admin-panel/modulos'

/**
 * El salto del panel a lo publicado.
 *
 * `rutaPublica` es la función que usan «Ver publicado ↗» después de publicar,
 * «abrir ficha →» sobre un comentario y el listado de fichas más leídas. Los
 * tres abren una pestaña nueva, así que cuando la dirección no existe lo que
 * sale es el 404 por omisión de Next —en inglés, sin navegación y sin vuelta—
 * y la conclusión razonable de quien acaba de pulsar «Publicar» es que la
 * publicación falló.
 *
 * Componía `${ruta}/${id}` para los cinco módulos, pero el examen físico no
 * tiene página por maniobra: se pintan todas en el listado, agrupadas por
 * segmento. La prueba de abajo mira el disco a propósito, porque el error no
 * era de lógica sino de una simetría que se dio por cierta.
 */

const PAGINAS = join(process.cwd(), 'src', 'app', '(frontend)')

/** Carpeta de la página de un módulo, a partir de su ruta pública. */
const carpetaDe = (ruta: string) => join(PAGINAS, ...ruta.split('/').filter(Boolean))

describe('rutaPublica', () => {
  it('apunta a una página que existe en los cinco módulos', () => {
    for (const modulo of MODULOS) {
      const destino = rutaPublica(modulo.slug, 7)

      if (destino.includes('#')) {
        // Sin ficha propia: el salto va al listado, que sí existe, y el ancla
        // sitúa el documento dentro.
        expect(destino.startsWith(`${modulo.ruta}#`)).toBe(true)
        expect(
          existsSync(join(carpetaDe(modulo.ruta), 'page.tsx')),
          `falta el listado de ${modulo.nombre}`,
        ).toBe(true)
      } else {
        expect(destino).toBe(`${modulo.ruta}/7`)
        expect(
          existsSync(join(carpetaDe(modulo.ruta), '[id]', 'page.tsx')),
          `${destino} no existe: ${modulo.nombre} no tiene página por documento`,
        ).toBe(true)
      }
    }
  })

  it('el examen físico salta al ancla del listado y no a una ficha inexistente', () => {
    expect(rutaPublica('maniobras', 7)).toBe('/examen-fisico#maniobra-7')
    expect(existsSync(join(PAGINAS, 'examen-fisico', '[id]'))).toBe(false)
  })

  it('la biblioteca conserva su nombre de cara al residente', () => {
    expect(rutaPublica('patologias', '12')).toBe('/biblioteca/12')
    expect(NOMBRE_DE_MODULO.patologias).toBe('Biblioteca de patologías')
  })

  it('una colección que no es módulo no inventa una dirección', () => {
    // Un comentario guardado contra una colección retirada no puede llevar a
    // `/undefined/3`: se vuelve a la portada.
    expect(rutaPublica('instrumental', 3)).toBe('/')
    expect(rutaPublica('', 3)).toBe('/')
  })
})
