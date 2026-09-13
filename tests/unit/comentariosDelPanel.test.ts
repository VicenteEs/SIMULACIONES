import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia de la pantalla de comentarios del panel.
 *
 * El entorno de estas pruebas es `node` y el proyecto no tiene jsdom, así que
 * ni la página de servidor ni la tabla se pueden montar: se mira el archivo en
 * el disco, igual que en `tablaUsuarios.test.ts` y `navegacion.test.ts`.
 *
 * Lo que se vigila aquí ya se rompió, y de la peor manera —en silencio, con
 * todo compilando:
 *
 *   - `fichaTitulo` estuvo declarado en `ComentarioDelPanel`, pintado por la
 *     tabla y usado en sus dos `aria-label`, pero nadie lo rellenaba. La
 *     columna «Ficha» seguía diciendo «Biblioteca de patologías» en las veinte
 *     filas y nunca de qué ficha hablaba cada una. Un prop opcional que no
 *     llega no rompe nada: ese es justo el problema.
 *   - La forma barata de resolverlo —un `findByID` por comentario, como hace
 *     la portada con sus cinco pendientes— aquí son hasta 500 consultas por
 *     carga, porque este listado trae 500. Tiene que ser una por colección.
 *   - Y el listado se leía sin `catch`: la base caída tumbaba la página con la
 *     pantalla genérica de Next, en inglés y sin barra para volver, justo en el
 *     panel al que se entra para averiguar qué está roto.
 */

const RAIZ = process.cwd()
const PAGINA = join(RAIZ, 'src', 'app', '(frontend)', 'admin-panel', 'comentarios', 'page.tsx')
const TABLA = join(
  RAIZ,
  'src',
  'app',
  '(frontend)',
  'admin-panel',
  'comentarios',
  'TablaComentarios.tsx',
)

/**
 * El archivo sin comentarios y en una sola línea.
 *
 * Sin quitar los comentarios, media prueba se cumpliría sola: los de esta casa
 * citan el código que explican, así que buscar `findByID` encontraría el
 * párrafo que dice por qué NO se usa y no una llamada.
 */
const leer = (ruta: string) =>
  readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')

const pagina = leer(PAGINA)
const tabla = leer(TABLA)

describe('el título de la ficha comentada', () => {
  it('lo rellena la página, no se queda en un prop muerto', () => {
    expect(pagina).toMatch(/fichaTitulo:/)
  })

  it('lo pinta la tabla', () => {
    expect(tabla).toContain('c.fichaTitulo')
  })

  it('se resuelve con una consulta por colección y no una por comentario', () => {
    // `id: { in: … }` es la forma; `findByID` es la que hay que impedir. Con
    // `limit: 500` arriba, una consulta por comentario son quinientos viajes a
    // la base cada vez que alguien abre esta pantalla.
    expect(pagina).toMatch(/id:\s*\{\s*in:/)
    expect(pagina).not.toContain('findByID')
  })

  it('solo consulta colecciones que siguen siendo módulos', () => {
    // Lo guardado sobrevive a que se retire una opción del `select`: un slug
    // viejo se convertiría en un `find` sobre una colección que no existe, y el
    // registro del servidor diría que falló la base.
    expect(pagina).toContain('SLUGS_DE_MODULOS')
  })
})

describe('la base que no responde', () => {
  it('no tumba la página', () => {
    expect(pagina).toMatch(/\.catch\(/)
  })

  it('tampoco se convierte en «todavía nadie ha comentado»', () => {
    // Cero y «no se pudo leer» no son lo mismo; es la misma confusión que las
    // tarjetas del resumen dejaron de cometer con `ilegible`. Un `catch` que
    // devuelve una lista vacía compila, se ve bien y miente.
    expect(pagina).not.toMatch(/catch[^)]*\)\s*=>\s*\(?\s*\{\s*docs:\s*\[\s*\]/)
    expect(pagina).toContain('No se pudo leer la tabla de comentarios')
  })
})
