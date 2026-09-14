import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AUTORIA } from '@/lib/autoria'

// Solo para pintar el layout público al final del archivo. Las otras pruebas
// leen archivos y no pasan por aquí. La barra y el aviso se sustituyen porque
// piden la base y el navegador, y lo que se mira no es a ellos.
const { sesionActual } = vi.hoisted(() => ({ sesionActual: { activo: false } }))
vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: sesionActual.activo ? { nombre: 'Residente' } : null,
    activo: sesionActual.activo,
    rolReal: sesionActual.activo ? 'lector' : null,
    rol: sesionActual.activo ? 'lector' : null,
    simulando: false,
    usuarioEfectivo: null,
  }),
}))
vi.mock('@/components/Navegacion', () => ({ Navegacion: () => null }))
vi.mock('@/components/AvisoActualizacion', () => ({ AvisoActualizacion: () => null }))

/**
 * La autoría se escribe una sola vez.
 *
 * El nombre y el correo de quien desarrolló la plataforma salen en el pie de
 * cada página, en la barra del panel, en la página de créditos y al pie de cada
 * correo. Copiarlos a mano en uno de esos sitios compila, se ve bien y pasa
 * cualquier otra prueba; el fallo llega el día que cambie la dirección, cuando
 * la copia sigue mandando a la vieja. Y la que se queda atrás suele ser la de
 * un correo, que es justo lo que se lee cuando algo no funciona.
 *
 * Por eso esta prueba no mira la forma de cada componente sino el repositorio
 * entero: que en `src` los dos valores aparezcan escritos una vez, en
 * `src/lib/autoria.ts`, y en ningún otro archivo.
 *
 * Los valores no se copian aquí tampoco: se importan de `AUTORIA`. Una prueba
 * con el correo escrito a mano sería la copia que vigila.
 */

const RAIZ = process.cwd()
const SRC = join(RAIZ, 'src')
const DECLARACION = join('src', 'lib', 'autoria.ts')

// Solo lo que es texto. Una imagen o una fuente no llevan el correo, y leerlas
// como UTF-8 solo añade ruido y tiempo.
const EXTENSIONES = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json', '.md', '.html'])

function archivosDe(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name)
    if (entrada.isDirectory()) return archivosDe(ruta)
    return EXTENSIONES.has(extname(entrada.name)) ? [ruta] : []
  })
}

/**
 * Sin tildes, en minúsculas y con los blancos juntos.
 *
 * Quien copia a mano no siempre copia bien: «Andres» sin tilde, el nombre
 * partido en dos líneas de JSX o el correo en mayúsculas siguen siendo la misma
 * copia que se queda atrás, y una búsqueda literal no los vería.
 */
const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')

function apariciones(texto: string, buscado: string): number {
  return normalizar(texto).split(normalizar(buscado)).length - 1
}

const archivos = archivosDe(SRC).map((ruta) => ({
  ruta: relative(RAIZ, ruta),
  texto: readFileSync(ruta, 'utf8'),
}))

describe('la autoría se declara en un solo sitio', () => {
  for (const [campo, valor] of Object.entries(AUTORIA)) {
    it(`el ${campo} aparece una vez en src, y es en src/lib/autoria.ts`, () => {
      const donde = archivos.flatMap(({ ruta, texto }) => {
        const veces = apariciones(texto, valor)
        return veces > 0 ? [`${ruta.split(sep).join('/')} (${veces})`] : []
      })

      expect(donde, `escrito a mano fuera de autoria.ts; importe AUTORIA`).toEqual([
        `${DECLARACION.split(sep).join('/')} (1)`,
      ])
    })
  }

  /**
   * Una copia del apellido o de la parte local del correo también es una copia:
   * «escríbale a vescudero» o «Dr. Escudero Durana» no casan con el valor
   * entero y se quedarían atrás igual.
   */
  it('tampoco se copian a trozos', () => {
    const [local] = AUTORIA.correo.split('@')
    const apellidos = AUTORIA.nombre.split(' ').slice(-2).join(' ')

    for (const trozo of [local, apellidos]) {
      const donde = archivos
        .filter(({ texto }) => apariciones(texto, trozo) > 0)
        .map(({ ruta }) => ruta.split(sep).join('/'))
      expect(donde, `«${trozo}» escrito fuera de autoria.ts`).toEqual([
        DECLARACION.split(sep).join('/'),
      ])
    }
  })
})

describe('quien muestra la autoría la importa', () => {
  /**
   * Que el texto no esté copiado no basta: un sitio que dejara de mostrar el
   * crédito también pasaría la prueba de arriba. Estos son los cuatro que lo
   * tienen que llevar, y cada uno tiene que usar los dos campos.
   *
   * Que importen el valor no dice que se vean. De que el pie esté montado se
   * ocupa el bloque siguiente.
   */
  const QUIENES = [
    ['el pie de página', ['src', 'components', 'PieDePagina.tsx']],
    ['la barra del panel', ['src', 'app', '(frontend)', 'admin-panel', 'layout.tsx']],
    ['la plantilla de correo', ['src', 'correo', 'plantilla.ts']],
    ['la página de créditos', ['src', 'app', '(frontend)', 'creditos', 'page.tsx']],
  ] as const

  for (const [nombre, partes] of QUIENES) {
    it(`${nombre} importa AUTORIA y usa el nombre y el correo`, () => {
      const fuente = readFileSync(join(RAIZ, ...partes), 'utf8')

      expect(fuente).toMatch(/import\s*\{[^}]*\bAUTORIA\b[^}]*\}\s*from\s*['"]@\/lib\/autoria['"]/)
      expect(fuente).toMatch(/AUTORIA\.nombre/)
      expect(fuente).toMatch(/AUTORIA\.correo/)
    })
  }
})

describe('el pie de página está montado', () => {
  /**
   * `PieDePagina` puede importar `AUTORIA` y seguir sin salir en ninguna
   * pantalla: basta con quitarlo del layout, o con meterlo dentro de la
   * condición de la sesión junto a la barra. Lo primero borra el crédito de
   * toda la plataforma; lo segundo se lo quita justo a quien más lo necesita,
   * el que no puede entrar. Ninguna de las dos cosas rompía nada.
   *
   * Por eso se pinta el layout de verdad, con y sin sesión, en lugar de buscar
   * `<PieDePagina />` en el código: una búsqueda no distingue si la etiqueta
   * está fuera o dentro del `sesion.activo ? … : null`, ni si está comentada.
   */
  for (const activo of [false, true]) {
    it(`sale ${activo ? 'con' : 'sin'} sesión, con el nombre y el correo`, async () => {
      sesionActual.activo = activo
      const { default: Layout } = await import('@/app/(frontend)/layout')
      const html = renderToStaticMarkup(
        (await Layout({ children: null })) as ReactElement,
      )

      expect(html).toContain('class="pie-de-pagina"')
      expect(html).toContain(AUTORIA.nombre)
      expect(html).toContain(`href="mailto:${AUTORIA.correo}"`)
    })
  }
})
