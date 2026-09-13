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

const TITULOS = join(RAIZ, 'src', 'app', '(frontend)', 'admin-panel', 'titulosDeFichas.ts')

const pagina = leer(PAGINA)
const tabla = leer(TABLA)
const titulos = leer(TITULOS)

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
    //
    // La consulta se mudó a `leerTitulosDeFichas`, que comparten actividad y
    // estadísticas: la forma se vigila allí, y aquí que la página la llama y no
    // ha vuelto a buscar por su cuenta.
    expect(pagina).toContain('leerTitulosDeFichas(payload,')
    expect(pagina).not.toContain('findByID')
    expect(titulos).toMatch(/id:\s*\{\s*in:/)
    expect(titulos).not.toContain('findByID')
  })

  it('distingue en cada fila la ficha borrada de la que no se pudo leer', () => {
    // Solo con el título, las dos se pintaban igual —el nombre del módulo y dos
    // enlaces—, y en la borrada los dos acababan en un 404. El estado tiene que
    // salir de la página y llegar a la tabla, que es quien quita los enlaces.
    expect(pagina).toMatch(/fichaEstado:/)
    expect(tabla).toContain("'eliminada'")
    expect(tabla).toContain("'ilegible'")
    expect(tabla).toContain('Ficha eliminada · #')
    expect(tabla).toContain('Título no disponible · #')
    // Y los enlaces se quitan de verdad, no solo cambia el rótulo.
    expect(tabla).toMatch(/c\.fichaEstado === 'eliminada'[^?]*\? null : \( <div className="admin-acciones">/)
    // Obligatorio: con `?` volvería a compilar una página que no lo rellena.
    expect(tabla).toMatch(/fichaEstado:\s*EstadoDeFicha\['tipo'\]\s*\|\s*null/)
    expect(tabla).toMatch(/fichaTitulo:\s*string\s*\|\s*null/)
  })

  it('avisa del módulo cuyos títulos no se pudieron leer', () => {
    expect(pagina).toContain('No se pudieron leer los títulos de')
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
