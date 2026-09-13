import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Lo que la hoja pública promete sobre marcado que vive en otro archivo.
 *
 * Un acoplamiento entre `estilos.css` y un `.tsx` no lo vigila nadie: no hay
 * compilador que lo mire y no rompe ninguna pantalla de golpe. Se rompe en las
 * dos direcciones y las dos ya se dieron aquí.
 *
 *  - La hoja apunta a algo que el marcado dejó de pintar: `.fases h4` contra el
 *    `<h3>` al que subió el título de la fase. La regla deja de aplicarse sin
 *    más y el título pierde tamaño y márgenes. Esa la vigila ya la prueba del
 *    final de `estilosPublicos.test.ts`.
 *  - El marcado escribe un dato que la hoja no viste: `BarraDeModulos` llevaba
 *    meses poniendo `aria-current="page"` y ninguna regla lo pintaba, así que en
 *    escritorio los cinco enlaces se veían idénticos en cualquier página de la
 *    plataforma y el estado existía solo para el lector de pantalla.
 *
 * Las dos comprobaciones de aquí son de esa segunda familia y pertenecen al
 * mismo archivo que la de `.fases`; se escribieron aparte y juntarlas el día que
 * se toquen a la vez es mover un bloque.
 *
 * Se comprueba la consecuencia y no la forma: que el estado se vea —no con qué
 * color—, y que la insignia no salga mal escrita —no qué `text-transform` lleva
 * cada regla—.
 */

const raiz = process.cwd()

/**
 * Los comentarios se quitan antes de buscar nada. Varios de ellos citan a
 * propósito el selector retirado y el valor viejo para explicar por qué se
 * fueron, así que en crudo estas comprobaciones casarían contra su propia
 * explicación en vez de contra el código.
 */
const hoja = readFileSync(join(raiz, 'src', 'app', '(frontend)', 'estilos.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

const sinComentarios = (fuente: string) => fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const menu = sinComentarios(
  readFileSync(join(raiz, 'src', 'components', 'MenuMovil.tsx'), 'utf8'),
)
const portada = sinComentarios(
  readFileSync(join(raiz, 'src', 'app', '(frontend)', 'page.tsx'), 'utf8'),
)

/**
 * La hoja partida en reglas. No es un analizador de CSS: `[^{}]+` no puede
 * cruzar una llave, así que las cabeceras de `@media` no llegan a casar y lo que
 * queda son las reglas de dentro con su selector, que es justo lo que se mira
 * aquí. Para lo demás está el analizador de `estilosPublicos.test.ts`.
 */
const REGLAS = [...hoja.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((trozo) => ({
  selector: trozo[1].trim().replace(/\s+/g, ' '),
  cuerpo: trozo[2],
}))

/**
 * Los cuerpos de las reglas cuyo selector es exactamente el que se pide.
 *
 * Exactamente, y por eso devuelve una lista: `.tarjeta-ficha .codigo` está
 * escrito tres veces en la hoja —el bloque de la insignia junto a `.borrador`,
 * sus colores, y el `text-transform`—, y buscar «la primera» daba la de los
 * colores, que no tiene nada que ver con lo que se comprueba abajo. La igualdad
 * es además lo que distingue ese selector de
 * `.continuar-leyendo .tarjeta-ficha .codigo`, que lo contiene entero.
 */
function reglasDe(selector: string): string[] {
  return REGLAS.filter((r) => r.selector === selector).map((r) => r.cuerpo)
}

/** ¿Alguna de esas reglas declara esta propiedad? */
function declara(cuerpos: string[], propiedad: string): boolean {
  const patron = new RegExp(`(?:^|[;\\s])${propiedad}\\s*:`)
  return cuerpos.some((cuerpo) => patron.test(cuerpo))
}

describe('el módulo actual se ve en la barra ancha', () => {
  it('la barra de escritorio sigue marcando el activo con aria-current', () => {
    expect(menu).toContain(
      "aria-current={esModuloActivo(rutaActual, m.ruta) ? 'page' : undefined}",
    )
  })

  /**
   * De las tres navegaciones con estado activo, esta era la única a medias: el
   * panel del teléfono lo pinta con `.menu-enlace-activo` y la barra del panel
   * con `.admin-nav-link[aria-current="page"]` en `admin.css`.
   */
  it('la hoja viste ese atributo y no deja el estado solo en el :hover', () => {
    const activo = reglasDe('.modulos a[aria-current="page"]')

    expect(activo.length, 'la barra marca el módulo actual y la hoja no lo pinta').toBeGreaterThan(
      0,
    )
    expect(declara(activo, 'color')).toBe(true)
    expect(declara(activo, 'border-bottom-color')).toBe(true)
  })

  it('el panel del teléfono conserva la suya', () => {
    expect(menu).toContain('menu-enlace-activo')
    expect(reglasDe('.menu-enlace-activo').length).toBeGreaterThan(0)
  })
})

describe('la insignia de «Continúa leyendo»', () => {
  /**
   * Es la razón de ser de la regla de abajo: esa insignia dejó de llevar el slug
   * de la tabla y pasa a llevar el nombre propio del módulo. Si vuelve a pintar
   * un slug, `capitalize` vuelve a ser lo correcto y el `none` sobra.
   */
  it('lleva el nombre del módulo y no el slug de la tabla', () => {
    expect(portada).toMatch(/className="codigo">\{NOMBRE_DE_MODULO\[/)
  })

  it('la hoja no le pone mayúscula a la preposición', () => {
    // El `capitalize` general se queda: es el de los códigos que escribe el
    // autor en las demás rejillas, y borrarlo devolvería el mando al
    // `uppercase` del bloque de `.tarjeta-ficha .codigo, .tarjeta-ficha
    // .borrador`, con lo que la insignia pasaría a «BIBLIOTECA DE PATOLOGÍAS».
    const general = reglasDe('.tarjeta-ficha .codigo')
    expect(general.some((cuerpo) => cuerpo.includes('capitalize'))).toBe(true)

    const enLaPortada = reglasDe('.continuar-leyendo .tarjeta-ficha .codigo')
    expect(enLaPortada.length, '«Biblioteca De Patologías» vuelve a la portada').toBeGreaterThan(0)
    expect(enLaPortada.some((cuerpo) => /text-transform\s*:\s*none/.test(cuerpo))).toBe(true)
  })
})
