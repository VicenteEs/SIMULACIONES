import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODULOS } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Vigilancia de la cáscara: la barra de módulos y las piezas sueltas que
 * cuelgan de ella.
 *
 * El entorno de estas pruebas es `node` y el proyecto no tiene jsdom, así que
 * ninguno de estos componentes se puede montar. Se miran en el disco, y solo lo
 * que comparte una propiedad incómoda: compila, se ve bien en pantalla, y falla
 * únicamente para una cuenta o un usuario que el que escribe el código no es.
 *
 *   - La barra sin filtrar ofrece módulos que la consulta va a negar. Payload
 *     no contesta a un `false` de acceso con una lista vacía: lanza `Forbidden`,
 *     y sin `error.tsx` en el árbol eso es la pantalla genérica de Next.
 *   - La pareja ruta/colección duplicada no rompe nada el día que se copia: se
 *     rompe el día que se renombra una colección y esta copia se queda atrás,
 *     y entonces el módulo desaparece para todos menos para el administrador.
 *   - Escape que cierra sin devolver el foco y un `aria-label` que tapa al
 *     texto visible no se ven mirando la pantalla. Se notan con el teclado y
 *     con el control por voz.
 */

const RAIZ = join(process.cwd(), 'src', 'components')
const fuente = (archivo: string): string => readFileSync(join(RAIZ, archivo), 'utf8')

/**
 * El archivo sin comentarios y en una sola línea.
 *
 * Sin quitar los comentarios, media prueba se cumpliría sola: los comentarios
 * de esta casa citan el código que explican, de modo que buscar `cerrar()`
 * encontraría la frase que dice por qué hay que llamarlo. El guardia de
 * `[^:'"\`]` está para no destripar un `https://` dentro de una cadena.
 */
const codigoDe = (archivo: string): string =>
  fuente(archivo)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')

const NAVEGACION = fuente('Navegacion.tsx')
const CODIGO_NAVEGACION = codigoDe('Navegacion.tsx')
const CODIGO_MENU = codigoDe('MenuMovil.tsx')
const CODIGO_IMPRIMIR = codigoDe('BotonImprimir.tsx')
const CODIGO_BIBLIOTECA = codigoDe('BibliotecaFiltrable.tsx')
const CODIGO_CONMUTADOR = codigoDe('ConmutadorVista.tsx')

describe('la barra de módulos', () => {
  it('recorta la lista con la misma función que decide el acceso', () => {
    // `puedeVerModulo` y no una comprobación propia: si la barra y la base
    // discrepan, la que gana es la base, y lo hace lanzando una excepción.
    expect(CODIGO_NAVEGACION).toMatch(/MODULOS\.filter\(\(m\) => puedeVerModulo\(/)
  })

  it('filtra con el usuario efectivo, el mismo con el que consultan las páginas', () => {
    // Con el usuario real, «ver como residente» enseñaría una barra que el
    // residente no tiene, que es justo lo que esa vista previa promete no hacer.
    expect(CODIGO_NAVEGACION).toContain('usuarioEfectivo')
  })

  it('no vuelve a escribir la pareja ruta/colección de los módulos', () => {
    expect(NAVEGACION).toContain("from '@/app/(frontend)/admin-panel/modulos'")
    for (const modulo of MODULOS) {
      expect(NAVEGACION).not.toContain(`'${modulo.ruta}'`)
    }
  })

  it('dice en qué módulo se está, y no solo con color', () => {
    // El estado activo viajaba únicamente como clase CSS: invisible para el
    // lector de pantalla y para quien no distingue ese azul.
    expect(CODIGO_MENU).toContain(
      "aria-current={esModuloActivo(rutaActual, m.ruta) ? 'page' : undefined}",
    )
    expect(CODIGO_MENU).toContain("aria-current={activo ? 'page' : undefined}")
  })
})

describe('el menú del teléfono', () => {
  it('cierra con Escape por el mismo camino que el aspa', () => {
    // `setAbierto(false)` a secas cerraba sin devolver el foco, y el panel al
    // que se quedaba agarrado se va de la pantalla sin salir del documento.
    expect(CODIGO_MENU).toMatch(/if \(evento\.key === 'Escape'\) \{ cerrar\(\) return \}/)
  })

  it('no deja que Tab se escape del panel que se anuncia como modal', () => {
    expect(CODIGO_MENU).toContain("evento.key !== 'Tab'")
    expect(CODIGO_MENU).toContain('evento.preventDefault()')
  })

  it('cerrado, sale del orden de tabulación y del árbol de accesibilidad', () => {
    // `hidden` solo no basta y por eso esta prueba existe: `.menu-panel` declara
    // su propio `display: flex`, que gana a la regla del navegador, así que el
    // panel cerrado se sigue maquetando fuera de pantalla. Sin `inert`, en el
    // teléfono el Tab recorría los enlaces de un panel invisible y el
    // `aria-modal` se anunciaba siempre. La trampa de foco no cubre este caso:
    // su efecto sale por `if (!abierto) return`.
    expect(CODIGO_MENU).toContain('inert={!abierto}')
  })
})

describe('las piezas sueltas', () => {
  it('el botón de imprimir responde al nombre que lleva escrito', () => {
    // Un `aria-label` no acompaña al texto visible: lo sustituye. Con «Imprimir
    // o guardar como PDF» encima de «Guardar PDF», decir «pulsar Guardar PDF»
    // no hacía nada, porque el control por voz compara con el nombre accesible
    // (WCAG 2.5.3). No se prohíbe la etiqueta: se exige que empiece por lo que
    // se lee en pantalla.
    expect(CODIGO_IMPRIMIR).toContain('Guardar PDF')
    const etiqueta = CODIGO_IMPRIMIR.match(/aria-label="([^"]*)"/)?.[1]
    expect(etiqueta ?? 'Guardar PDF').toMatch(/^Guardar PDF/)
    // El icono no aporta nombre; sin ocultarlo se lee entre el rótulo y el foco.
    expect(CODIGO_IMPRIMIR).toContain('aria-hidden="true"')
  })

  it('limpiar los filtros deja el foco en el buscador', () => {
    // Los dos botones que limpian se desmontan en el mismo clic que los activa.
    expect(CODIGO_BIBLIOTECA).toContain('buscador.current?.focus()')
  })

  it('el conmutador de vista se suelta aunque la petición falle', () => {
    // Sin `finally`, un fetch rechazado dejaba el botón en gris para siempre;
    // sin mirar la respuesta, un 403 se veía igual que un cambio aplicado.
    expect(CODIGO_CONMUTADOR).toContain('finally {')
    expect(CODIGO_CONMUTADOR).toContain('if (!respuesta.ok)')
  })
})
