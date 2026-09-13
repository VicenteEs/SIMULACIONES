import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Que la casilla de «leída» diga de qué maniobra habla.
 *
 * En los cuatro módulos con página por documento la casilla es una sola y el
 * `<h1>` de la página ya nombra la ficha, así que el texto fijo «Marcar como
 * leída» basta. En el examen físico no hay página por documento: se montan
 * tantas casillas como maniobras publicadas bajo un `<h1>` que dice «Examen
 * físico» y nada más, y un lector de pantalla recita N veces «casilla de
 * verificación, Marcar como leída» sin decir de cuál. Marcar la que se acaba de
 * leer queda en contar casillas desde arriba.
 *
 * El repositorio ya había resuelto esto para el hermano que va en la MISMA
 * tarjeta —`FormularioComentario` y su `label`— y el rastreador se montó al lado
 * sin el mismo tratamiento, que es el motivo de que esta prueba exista: en esa
 * tarjeta los dos controles se nombran o no se nombra ninguno.
 *
 * Se mira en el disco por lo mismo que las otras doce del módulo: el entorno de
 * pruebas es `node`, no hay jsdom ni biblioteca de componentes, y quitar la
 * propiedad compila, se despliega y no se nota en ninguna pantalla.
 */

const RAIZ = join(process.cwd(), 'src')
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const LISTADO = fuente('app', '(frontend)', 'examen-fisico', 'page.tsx')
const RASTREADOR = fuente('components', 'RastreadorActividad.tsx')

/**
 * Las propiedades del `<RastreadorActividad>`, y solo las suyas.
 *
 * Igual que en `rastreadorActividad.test.ts` y en `lecturaDelExamenFisico.test.ts`,
 * y por el mismo motivo: buscar en la fuente entera daría por bueno el atributo
 * del `<FormularioComentario>`, que está en la misma tarjeta.
 */
function propiedadesDelRastreador(codigo: string): string {
  const inicio = codigo.indexOf('<RastreadorActividad')
  if (inicio === -1) return ''
  return codigo.slice(inicio, codigo.indexOf('/>', inicio))
}

/**
 * Los atributos del `<input type="checkbox">` del rastreador, sin el comentario
 * que lo precede: ahí dentro se nombra `aria-label` al explicar por qué el
 * atributo a veces no se pinta, y buscarlo en el archivo entero daría por
 * cableado lo que solo está contado.
 */
function atributosDeLaCasilla(): string {
  const inicio = RASTREADOR.indexOf('<input')
  if (inicio === -1) return ''
  return RASTREADOR.slice(inicio, RASTREADOR.indexOf('/>', inicio))
}

describe('el rastreador acepta el nombre de la ficha y lo usa', () => {
  it('declara la propiedad como opcional', () => {
    // Opcional a propósito: las cuatro fichas por documento no la escriben y
    // siguen con el texto fijo, que allí es correcto.
    expect(RASTREADOR).toContain('nombreDeLaFicha?: string')
  })

  it('la pone en el <input>, que es lo que anuncia el lector', () => {
    // Declararla y no cablearla es el fallo que más ha costado en este
    // repositorio. El nombre accesible de una casilla sale de su `<input>`: en
    // el `<span>` no cambiaría nada de lo que se oye.
    expect(atributosDeLaCasilla()).toContain('aria-label={')
    expect(atributosDeLaCasilla()).toContain('nombreDeLaFicha')
  })

  it('sin nombre no pinta el atributo', () => {
    // Un `aria-label` vacío deja la casilla sin nombre, y uno con el texto
    // repetido sería mantener dos veces la misma frase. Sin nombre de ficha el
    // atributo no existe y vuelve a mandar el `<span>` a través del `<label>`.
    expect(atributosDeLaCasilla()).toContain(': undefined')
  })

  it('el texto visible se queda como estaba', () => {
    // La tarjeta del listado es estrecha y el nombre de una maniobra es largo:
    // el `<span>` dice el estado y el `aria-label` dice la ficha.
    expect(RASTREADOR).toContain(`{completado ? 'Marcada como leída' : 'Marcar como leída'}`)
  })
})

describe('el listado del examen físico nombra sus casillas', () => {
  it('pasa el nombre de la maniobra al rastreador', () => {
    expect(propiedadesDelRastreador(LISTADO)).toContain('nombreDeLaFicha={String(m.nombre)}')
  })

  it('los dos controles de la tarjeta se nombran igual de bien', () => {
    // El formulario de comentario ya lo hacía. Que uno de los dos se quede sin
    // nombrar es peor que si no lo hiciera ninguno: la tarjeta se lee a medias y
    // parece que el descuido es del lector de pantalla.
    expect(LISTADO).toContain('label={`Comentar mejora sobre ${m.nombre}`}')
  })

  it('las cuatro fichas por documento siguen sin escribirla', () => {
    // Allí el `<h1>` nombra la ficha: repetirlo en la casilla sería decir dos
    // veces lo mismo a quien escucha la página entera.
    for (const carpeta of ['biblioteca', 'tecnica-ao', 'simulador', 'imagenes']) {
      const ficha = fuente('app', '(frontend)', carpeta, '[id]', 'page.tsx')
      expect(
        propiedadesDelRastreador(ficha),
        `${carpeta} empezó a escribir nombreDeLaFicha`,
      ).not.toContain('nombreDeLaFicha')
    }
  })
})
