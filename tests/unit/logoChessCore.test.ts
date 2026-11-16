import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LogoChessCore, SITIO_DE_CHESSCORE } from '@/components/LogoChessCore'
import { PieDePagina } from '@/components/PieDePagina'
import { PieDeVisitante } from '@/components/portada/PieDeVisitante'
import { SobreNosotros } from '@/components/portada/SobreNosotros'
import { leerLaPagina } from '@/lib/mediosDeLaPagina'

/**
 * Todo logo de ChessCore lleva a chesscore.cl, esté donde esté (D-378).
 *
 * El enlace vive dentro de `LogoChessCore`, y eso solo sirve si nadie pinta el
 * logo por otro camino: un `<img src="/logo-chesscore.png">` escrito a mano se
 * ve igual, compila y no enlaza a nada. De ahí las tres cosas que se miran:
 * que el componente pinte el enlace bien, que ningún otro archivo nombre los
 * dibujos, y que en los sitios que se pueden pintar aquí el enlace salga y no
 * quede dentro de otro enlace, que no es HTML válido.
 */

const RAIZ = join(__dirname, '..', '..')
const ARCHIVOS_DEL_LOGO = ['logo-chesscore.png', 'logo-chesscore-claro.png']

/** Los enlaces abiertos a la vez en cada punto del HTML; más de uno es un `<a>` dentro de otro. */
function enlacesAnidados(html: string): number {
  let abiertos = 0
  let maximo = 0
  for (const etiqueta of html.matchAll(/<(\/?)a[\s>]/g)) {
    abiertos += etiqueta[1] ? -1 : 1
    maximo = Math.max(maximo, abiertos)
  }
  return maximo
}

function enlacesAChessCore(html: string): string[] {
  return [...html.matchAll(/<a [^>]*href="https:\/\/chesscore\.cl"[^>]*>/g)].map((m) => m[0])
}

describe('el componente', () => {
  for (const sobre of ['papel', 'oscuro'] as const) {
    it(`sobre ${sobre}: un enlace a chesscore.cl, en otra pestaña y diciéndolo`, () => {
      const html = renderToStaticMarkup(createElement(LogoChessCore, { sobre }))

      expect(SITIO_DE_CHESSCORE).toBe('https://chesscore.cl')
      const [enlace] = enlacesAChessCore(html)
      expect(enlace).toBeDefined()
      expect(enlace).toContain('target="_blank"')
      // `noopener` sí y `noreferrer` no: chesscore.cl tiene que ver que la visita viene de aquí.
      expect(enlace).toContain('rel="noopener"')
      expect(enlace).not.toContain('noreferrer')
      // El anillo de foco se elige por este atributo (`estilos.css`).
      expect(enlace).toContain(`data-sobre="${sobre}"`)
      // Un enlace hecho de una imagen se anuncia por su texto alternativo.
      expect(html).toMatch(/alt="ChessCore[^"]*abre chesscore\.cl en otra pestaña[^"]*"/)
      expect(html).toContain(sobre === 'oscuro' ? 'logo-chesscore-claro.png' : 'logo-chesscore.png')
    })
  }

  it('la hoja le pone un anillo de foco por cada fondo', () => {
    const hoja = readFileSync(join(RAIZ, 'src', 'app', '(frontend)', 'estilos.css'), 'utf8')
    expect(hoja).toMatch(/\.logo-chesscore-enlace\[data-sobre='papel'\]:focus-visible\s*\{[^}]*outline:/)
    expect(hoja).toMatch(/\.logo-chesscore-enlace\[data-sobre='oscuro'\]:focus-visible\s*\{[^}]*outline:[^;]*var\(--cian\)/)
  })
})

describe('nadie pinta el logo sin el componente', () => {
  function archivosDe(carpeta: string): string[] {
    return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
      const ruta = join(carpeta, entrada.name)
      if (entrada.isDirectory()) return archivosDe(ruta)
      return ['.ts', '.tsx', '.css'].includes(extname(entrada.name)) ? [ruta] : []
    })
  }

  it('los dos dibujos solo se nombran en LogoChessCore.tsx', () => {
    const quienes = archivosDe(join(RAIZ, 'src'))
      .filter((archivo) => ARCHIVOS_DEL_LOGO.some((nombre) => readFileSync(archivo, 'utf8').includes(nombre)))
      .map((archivo) => relative(RAIZ, archivo).split(sep).join('/'))
    expect(quienes).toEqual(['src/components/LogoChessCore.tsx'])
  })

  // Los cuatro sitios que tenían el logo cuando se decidió el enlace. Que lo
  // sigan usando no lo pide D-378; lo que se mira es que, si lo usan, lo usen
  // por el componente. Quitar el logo de uno de ellos es otra decisión, y esta
  // prueba obliga a tomarla a la vista.
  const SITIOS = [
    ['la firma del menú lateral del panel', ['src', 'app', '(frontend)', 'admin-panel', 'layout.tsx']],
    ['el pie de las páginas con sesión', ['src', 'components', 'PieDePagina.tsx']],
    ['el pie de la portada pública', ['src', 'components', 'portada', 'PieDeVisitante.tsx']],
    ['la tarjeta de ChessCore en «Sobre nosotros»', ['src', 'components', 'portada', 'SobreNosotros.tsx']],
  ] as const

  for (const [nombre, partes] of SITIOS) {
    it(`${nombre} lo pinta con LogoChessCore`, () => {
      const fuente = readFileSync(join(RAIZ, ...partes), 'utf8')
      expect(fuente).toMatch(/import\s*\{\s*LogoChessCore\s*\}\s*from\s*['"]@\/components\/LogoChessCore['"]/)
      expect(fuente).toMatch(/<LogoChessCore\b/)
    })
  }
})

describe('pintado en su sitio, enlaza y no queda dentro de otro enlace', () => {
  // La barra del panel no se pinta aquí: pide la sesión, la guardia y el
  // enrutador. De ella responde la búsqueda de arriba, y su firma, a la vista,
  // no está dentro de ningún enlace (el `mailto:` va después, aparte).
  const SITIOS: [string, () => Promise<ReactElement>, number][] = [
    // Las dos versiones, la negra y la blanca, están en el HTML; la hoja elige cuál se ve.
    ['el pie de las páginas con sesión', async () => createElement(PieDePagina), 2],
    ['el pie de la portada pública', async () => createElement(PieDeVisitante, { pagina: await leerLaPagina(null) }), 1],
    [
      '«Sobre nosotros»',
      async () => createElement(SobreNosotros, { pagina: await leerLaPagina(null), equipo: [] }),
      1,
    ],
  ]

  for (const [nombre, pintar, cuantos] of SITIOS) {
    it(nombre, async () => {
      const html = renderToStaticMarkup(await pintar())
      expect(enlacesAChessCore(html)).toHaveLength(cuantos)
      expect(enlacesAnidados(html)).toBeLessThanOrEqual(1)
    })
  }
})
