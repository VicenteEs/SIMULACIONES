import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia de los títulos y del listado en la pantalla de actividad.
 *
 * Mismo método que `comentariosDelPanel.test.ts`: el entorno es `node`, sin
 * jsdom, así que la página de servidor no se monta y se mira el archivo.
 * `cableadoDelProgreso.test.ts` ya lee esta página, pero solo por la parte del
 * simulador; lo de aquí no lo miraba nadie.
 *
 * Las dos cosas que se vigilan se corrigieron el mismo día y las dos vuelven en
 * silencio, compilando y con la pantalla aparentemente bien:
 *
 *   - Los títulos se buscaban con un `findByID` por ficha y un `catch` vacío.
 *     `findByID` lanza igual con la ficha borrada que con la base sin
 *     responder, así que una tabla caída pintaba todas las filas como «Ficha
 *     eliminada» y mandaba a buscar en los respaldos algo que estaba en su
 *     sitio.
 *   - El listado caía a `{ docs: [], totalDocs: 0 }` si la consulta fallaba, y
 *     la pantalla decía «Todavía nadie ha abierto una ficha».
 */

const RAIZ = process.cwd()
const PAGINA = join(RAIZ, 'src', 'app', '(frontend)', 'admin-panel', 'actividad', 'page.tsx')

/**
 * El archivo sin comentarios y en una sola línea.
 *
 * Sin quitarlos, media prueba se cumpliría sola: el comentario de la página
 * cita el `findByID` y el `{ docs: [], totalDocs: 0 }` que dejó de usar para
 * explicar por qué.
 */
const leer = (ruta: string) =>
  readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')

const pagina = leer(PAGINA)

describe('los títulos de las fichas en actividad', () => {
  it('los busca la función compartida, no un findByID por ficha', () => {
    expect(pagina).toContain('leerTitulosDeFichas(payload,')
    expect(pagina).not.toContain('findByID')
  })

  it('avisa del módulo cuyos títulos no se pudieron leer', () => {
    // Sin el aviso, veinte «Título no disponible» no dicen que fue una sola
    // consulta la que falló.
    expect(pagina).toContain('No se pudieron leer los títulos de')
    expect(pagina).toContain('Título no disponible · #')
  })

  it('no ofrece enlaces a una ficha que se sabe borrada', () => {
    expect(pagina).toContain("estado.tipo !== 'eliminada'")
  })
})

describe('el listado que no se puede leer', () => {
  it('no se convierte en «todavía nadie ha abierto una ficha»', () => {
    expect(pagina).not.toMatch(/catch[^)]*\)\s*=>\s*\(?\s*\{\s*docs:\s*\[\s*\]/)
    expect(pagina).toContain('No se pudo leer la tabla de actividad')
  })

  it('tampoco da un recuento de cero registros', () => {
    // El subtítulo con «0 registros» sería la misma respuesta falsa que el
    // aviso existe para no dar: solo se pinta si hubo listado.
    expect(pagina).toMatch(/\{listado \? \( <p className="admin-subtitle"> \{totalDocs\}/)
  })
})
