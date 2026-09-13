import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODULOS, rutaPublica } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Que los cinco módulos sepan anotar una lectura, cada uno por su camino.
 *
 * La cifra «por leer» de la portada es `totalFichas - leidas` (`page.tsx`):
 * `totalFichas` suma los conteos de los cinco módulos y `leidas` cuenta filas
 * de `actividad`. Un módulo cuyas fichas entran en la primera suma y nunca en
 * la segunda le pone a esa resta un suelo que no baja, y eso no se ve en
 * ninguna pantalla: la portada enseña un número perfectamente plausible. Es
 * justo lo que pasaba con Técnica AO y Lectura de imágenes, y después con el
 * examen físico, que marca desde su listado (`lecturaDelExamenFisico.test.ts`).
 *
 * Se mira en el disco porque las fichas son componentes de servidor y no hay
 * prueba que las ejecute: olvidar el `<RastreadorActividad>` en una compila,
 * se despliega y solo se nota meses después.
 */

const SRC = join(process.cwd(), 'src')
const RAIZ = join(SRC, 'app', '(frontend)')

/**
 * Los cuatro módulos con página por documento, con la carpeta de cada uno.
 *
 * `envoltorio` es el componente que monta el rastreador cuando la página no lo
 * monta suelto. El simulador lo pone dentro de `CasoConSuLectura`, junto a la
 * consola, porque terminar el caso también marca la lectura y la casilla tiene
 * que enterarse sin recargar (la cabecera del envoltorio lo explica).
 */
const CON_FICHA = [
  { slug: 'patologias', carpeta: 'biblioteca', envoltorio: null },
  { slug: 'casos-ao', carpeta: 'tecnica-ao', envoltorio: null },
  {
    slug: 'cirugias',
    carpeta: 'simulador',
    envoltorio: { etiqueta: 'CasoConSuLectura', archivo: ['components', 'simulador', 'CasoConSuLectura.tsx'] },
  },
  { slug: 'estudios-ia', carpeta: 'imagenes', envoltorio: null },
]

/** Recorta comentarios, como `cableadoDelProgreso.test.ts`: los de estas páginas nombran lo que cablean. */
const sinComentarios = (codigo: string): string =>
  codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\}/g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const fichaDe = (carpeta: string): string =>
  sinComentarios(readFileSync(join(RAIZ, carpeta, '[id]', 'page.tsx'), 'utf8'))

/**
 * Las propiedades de la etiqueta `<Componente … />`, y solo las suyas.
 *
 * Buscar `coleccion="…"` en la fuente entera daría por bueno el atributo del
 * `<FormularioComentario>`, que está en las cuatro páginas y lleva el mismo
 * nombre: una ficha que pasara el slug al formulario y se lo olvidara al
 * rastreador saldría verde.
 */
function propiedadesDe(fuente: string, componente: string): string {
  const inicio = fuente.indexOf(`<${componente}`)
  if (inicio === -1) return ''
  return fuente.slice(inicio, fuente.indexOf('/>', inicio))
}

/**
 * Lo que la página le da a la casilla, y lo que la casilla recibe al final.
 *
 * Sin envoltorio es la misma etiqueta. Con él son dos: la página pasa
 * `documentoId` y `completadoInicial` al envoltorio, y el envoltorio se los
 * pasa al rastreador con sus propios nombres. Mirar solo la página dejaba el
 * rastreador del simulador como un texto vacío, y la prueba roja por la razón
 * equivocada; mirar solo el envoltorio no comprobaría que la página le da algo.
 */
function cadenaDeLaCasilla(ficha: (typeof CON_FICHA)[number]) {
  const pagina = fichaDe(ficha.carpeta)
  if (!ficha.envoltorio) {
    const propiedades = propiedadesDe(pagina, 'RastreadorActividad')
    return { pagina, deLaPagina: propiedades, rastreador: propiedades, documento: 'id', completado: null }
  }
  const envoltorio = sinComentarios(readFileSync(join(SRC, ...ficha.envoltorio.archivo), 'utf8'))
  return {
    pagina,
    deLaPagina: propiedadesDe(pagina, ficha.envoltorio.etiqueta),
    rastreador: propiedadesDe(envoltorio, 'RastreadorActividad'),
    documento: 'documentoId',
    completado: 'completadoInicial',
  }
}

describe('las cuatro fichas anotan su lectura', () => {
  it.each(CON_FICHA)('$carpeta monta el rastreador sobre «$slug»', (ficha) => {
    const { deLaPagina, rastreador, documento } = cadenaDeLaCasilla(ficha)
    expect(deLaPagina, `${ficha.carpeta} no monta la casilla`).not.toBe('')
    expect(rastreador, `no se encontró el rastreador de ${ficha.carpeta}`).not.toBe('')
    expect(rastreador).toContain(`coleccion="${ficha.slug}"`)
    expect(rastreador).toContain(`documentoId={${documento}}`)
    // La ficha que abre la página, y no otra: con envoltorio, eso lo dice la
    // página al pasárselo.
    expect(deLaPagina).toContain('documentoId={id}')
  })

  it.each(CON_FICHA)('$carpeta pregunta si ya estaba leída antes de pintar la casilla', (ficha) => {
    // El rastreador es de cliente y nace con `completadoInicial`: sin la
    // pregunta previa la casilla sale en blanco en cada carga y el residente
    // vuelve a marcar lo que ya tenía marcado.
    //
    // La pregunta era un `collection: 'actividad'` copiado en cada ficha, y eso
    // es lo que se buscaba aquí. Ahora vive en `src/lib/lecturas.ts`; que cada
    // página la llame con su slug lo vigila `lecturasCableadas.test.ts`. Lo que
    // se sostiene aquí es que la respuesta llegue de verdad a la casilla: una
    // página que llama a la función y luego pinta `completadoInicial={false}`,
    // o el `leida` de otra variable, pasa aquella prueba y deja la casilla en
    // blanco igual que antes de la mudanza.
    const { pagina, deLaPagina, rastreador, completado } = cadenaDeLaCasilla(ficha)

    const llamada = new RegExp(
      `const (\\w+) = await lecturasDelResidente\\(payload, usuarioEfectivo, '${ficha.slug}', \\[id\\]\\)`,
    ).exec(pagina)
    expect(llamada, `${ficha.carpeta} no espera la respuesta de lecturasDelResidente`).not.toBeNull()
    const lecturas = llamada![1]

    // Antes de pintar: después del `return (` ya no hay casilla que decidir.
    const pintar = pagina.indexOf('return (')
    expect(pintar).toBeGreaterThan(-1)
    expect(llamada!.index).toBeLessThan(pintar)

    // Lo que recibe la casilla es `leida(id)` de esa respuesta, directamente o
    // a través de una constante con ese valor.
    const valor = /completadoInicial=\{([^}]+)\}/.exec(deLaPagina)?.[1]
    expect(valor, `${ficha.carpeta} no le pasa completadoInicial a la casilla`).toBeDefined()
    const directo = `${lecturas}.leida(id)`
    const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const porConstante = new RegExp(
      `const ${literal(valor ?? '')} = ${literal(lecturas)}\\.leida\\(id\\)`,
    ).test(pagina)
    expect(valor === directo || porConstante, `${ficha.carpeta} pinta ${valor}`).toBe(true)

    // Y con envoltorio, que el envoltorio no se la quede por el camino.
    if (completado) {
      expect(rastreador).toMatch(new RegExp(`completadoInicial=\\{[^}]*\\b${completado}\\b[^}]*\\}`))
    }
  })
})

describe('el examen físico es la excepción, y se sabe por qué', () => {
  it('no tiene página por documento', () => {
    // Por eso marca desde el listado, una casilla por maniobra
    // (`lecturaDelExamenFisico.test.ts`). Si esto se pone en rojo es porque
    // alguien creó la ficha por maniobra: hay que montarle su
    // `<RastreadorActividad>`, añadirla a `CON_FICHA` y quitar del listado sus
    // casillas, o cada maniobra tendría dos sitios que marcan.
    expect(existsSync(join(RAIZ, 'examen-fisico', '[id]', 'page.tsx'))).toBe(false)
    expect(rutaPublica('maniobras', 7)).toBe('/examen-fisico#maniobra-7')
  })

  it('sus fichas siguen contando en la portada', () => {
    // Las maniobras entran en `totalFichas` porque `maniobras` está en la lista
    // de módulos que la portada cuenta, y desde que el listado las marca
    // también pueden entrar en `leidas`. Quitar el módulo de la lista para
    // bajar «por leer» no es un arreglo: dejaría de contarse contenido que sí
    // existe.
    expect(MODULOS.map((m) => m.slug)).toContain('maniobras')
    expect(MODULOS).toHaveLength(5)
  })
})
