import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia de los bloques de contenido.
 *
 * Es un componente de servidor y la suite no tiene jsdom: se mira en el disco.
 * Los tres fallos de abajo se publicaron sin que nadie lo notara porque los
 * tres se ven perfectos en la pantalla del que los escribe:
 *
 *   - Un `RichText` sin `converters` pinta los enlaces del autor con el
 *     convertidor de Payload: sin `ruta()` —404 en el servidor, que tiene
 *     prefijo, y correcto en desarrollo, que no lo tiene—, sin pasar por
 *     `enlaceSeguro` y abriéndolos en otra pestaña aunque apunten aquí mismo.
 *   - El `alt` del video se le exige al autor con el rótulo «Descripción para
 *     lectores de pantalla» y no llegaba a ninguna parte.
 *   - Un bloque al que se le olvidó elegir modelo decía que el archivo no se
 *     pudo cargar, y mandaba al traumatólogo a buscar una avería en el
 *     servidor teniendo el campo vacío en su propio editor.
 */

const BLOQUES = readFileSync(join(process.cwd(), 'src', 'components', 'Bloques.tsx'), 'utf8')

describe('los bloques de contenido', () => {
  it('pinta todo el texto rico con los convertidores de la casa', () => {
    const usos = BLOQUES.match(/<RichText[\s\S]*?\/>/g) ?? []
    expect(usos.length).toBeGreaterThan(0)
    for (const uso of usos) {
      expect(uso).toContain('converters={conversoresRicos}')
    }
  })

  it('el reproductor de video lleva la descripción que el autor está obligado a escribir', () => {
    // El `<figcaption>` no vale: nombra a la `<figure>`, no al reproductor.
    expect(BLOQUES).toContain('aria-label={video.alt}')
  })

  it('un bloque sin modelo no se anuncia como un archivo que falló al cargar', () => {
    expect(BLOQUES).not.toContain('no se pudo cargar')
  })
})
